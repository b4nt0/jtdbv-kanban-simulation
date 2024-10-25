import {
  Simulation,
  Entity,
  Queue,
  Exponential,
  Uniform,
  Tally,
  RandomVar,
  EventArgs,
} from 'simscript';

const NAMES = [
  'Alice',
  'Bob',
  'Charlotte',
  'David',
  'Eve',
  'Frank',
  'Grace',
  'Hank',
  'Ivy',
  'Jack',
  'Karen',
  'Leo',
  'Mia',
  'Noah',
  'Olivia',
  'Paul',
  'Quinn',
  'Rachel',
  'Sam',
  'Tina',
  'Uma',
  'Victor',
  'Wendy',
  'Xander',
  'Yara',
  'Zoe',
];

const WORKSTATIONS = [
  'Alpha',
  'Bravo',
  'Charlie',
  'Delta',
  'Echo',
  'Foxtrot',
  'Golf',
  'Hotel',
  'India',
  'Juliett',
  'Kilo',
  'Lima',
  'Mike',
  'November',
  'Oscar',
  'Papa',
  'Quebec',
  'Romeo',
  'Sierra',
  'Tango',
  'Uniform',
  'Victor',
  'Whiskey',
  'X-ray',
  'Yankee',
  'Zulu',
];

const COLORS = ['green', 'blue', 'magenta', 'orange', 'maroon'];

const BREAK_CHANCE_EVERY: number = 200;

export type SimulationRules = 'self' | 'manager' | 'kanban';

export type LoadStatus = -1 /* underload */ | 0 /* normal */ | 1 /* overload */;

export class SimulationOptions {
  capacity: number = 5;
  workTimeM: number = 5;
  workTimeD: number = 3;
  ordersPerHour: number = 10;
  rules: SimulationRules = 'self';
  reactionTime: number = 5;
  helpersM: number = 2;
  helpersD: number = 1;
  wipLimit: number = 3;
  managersPerfection: number = 1;
  managerialInterventionFrequency = 5;
  randomBreakProbability = 0.001;
  randomBreakDurationM: number = 60;
  randomBreakDurationD: number = 20;
  totalSimulationTimeDays: number = 10;
}

export class Worker {
  private _workstation?: Workstation;

  get workstation(): Workstation {
    return this.workstation;
  }

  set workstation(value: Workstation) {
    if (this._workstation) {
      this._workstation.unassign(this);
    }

    if (value) {
      value.assign(this);
      if (!this.home) {
        // The first workstation a worker is assigned to,
        // becomes their home by default
        this.home = value;
      }
    }

    this._workstation = value;
  }

  public home?: Workstation;

  name: string;

  constructor(name: string) {
    this.name = name;
  }
}

export class Workstation {
  private _workers: Worker[] = [];
  public get workers(): Worker[] {
    return this._workers;
  }

  name: string;
  waitQueue: Queue;
  queue: Queue;

  workTimeM: number;
  workTimeD: number;
  work: Uniform;

  wipLimit: number;
  reactionTime: number;
  _overloadSince: number = -1;
  _underloadSince: number = -1;
  _normalSince: number = -1;
  _lastKnownLoadStatus: LoadStatus = 0;

  /*
    Gets the current load state of the workstation.
    Takes reaction time into account, i.e. the state
    changes only after the reaction time passes.
  */
  perceivedLoadNow(currentTime: number): LoadStatus {
    // Check the current real status
    let result: LoadStatus = this._lastKnownLoadStatus;

    if (this.waitQueue.unitsInUse >= this.wipLimit) {
      // Overload
      if (this._overloadSince == -1) {
        this._overloadSince = currentTime;
        this._underloadSince = -1;
        this._normalSince = -1;
      }

      if (currentTime - this._overloadSince > this.reactionTime) {
        result = 1;
      }
    } else if (this.waitQueue.unitsInUse <= 0) {
      // Underload
      if (this._underloadSince == -1) {
        this._underloadSince = currentTime;
        this._overloadSince = -1;
        this._normalSince = -1;
      }

      if (currentTime - this._underloadSince > this.reactionTime) {
        result = -1;
      }
    } else {
      // Normal
      if (this._normalSince == -1) {
        this._normalSince = currentTime;
        this._underloadSince = -1;
        this._overloadSince = -1;
      }

      if (currentTime - this._normalSince > this.reactionTime) {
        result = 0;
      }
    }

    this._lastKnownLoadStatus = result;
    return result;
  }

  private _slow: boolean = false;
  get slow(): boolean {
    return this._slow;
  }
  set slow(value: boolean) {
    this._slow = value;
    if (value) {
      this._fast = false;
    }
  }

  _fast: boolean = false;
  get fast(): boolean {
    return this._fast;
  }
  set fast(value: boolean) {
    this._fast = value;
    if (value) {
      this._slow = false;
    }
  }

  constructor(
    name: string,
    startingWorkers?: Worker[],
    workTimeM: number = 300,
    workTimeD: number = 200,
    wipLimit: number = 3,
    reactionTime: number = 30
  ) {
    this.name = name;
    this.wipLimit = wipLimit;
    this.reactionTime = reactionTime;
    this.waitQueue = new Queue(`Waiting for ${name}`);
    this.queue = new Queue(name, 0);

    this.workTimeM = workTimeM;
    this.workTimeD = workTimeD;
    this.work = new Uniform(
      this.workTimeM - this.workTimeD,
      this.workTimeM + workTimeD
    );

    if (startingWorkers) {
      for (let w of startingWorkers) {
        w.workstation = this;
      }
    }
  }

  public unassign(worker: Worker) {
    let i = this._workers.indexOf(worker);
    if (i >= 0) {
      this._workers.splice(i, 1);
      if (this.queue.capacity) {
        this.queue.capacity -= 1;
      }
    }
  }

  public assign(worker: Worker) {
    if (!this._workers.includes(worker)) {
      this._workers.push(worker);
      this.queue.capacity = (this.queue.capacity || 0) + 1;
    }
  }

  public async process(box: Box) {
    await box.enterQueue(this.waitQueue);

    await box.enterQueue(this.queue);
    box.leaveQueue(this.waitQueue);

    // Control if the time delay is accurate
    let enterTime = box.simulation.timeNow;

    let timeDelay = this.work.sample();
    if (this.slow) {
      timeDelay *= 10;
    } else if (this.fast) {
      timeDelay /= 10;
    }
    await box.delay(timeDelay);
    box.leaveQueue(this.queue);

    let outOfSync = box.simulation.timeNow - enterTime - timeDelay;
    if (outOfSync > 5) {
      console.warn('Delay out of sync by', outOfSync);
    }
  }
}

export class Flow extends Simulation {
  rules: SimulationOptions;

  workers: Worker[] = [];
  workstations: Workstation[] = [];

  boxGenerationInterval: RandomVar;
  boxStatistics: Tally = new Tally();

  helpers: Uniform;
  latestManagerialIntervention: number = 0;

  brokenWorkstation?: Workstation;
  brokenUntil?: number;
  breakDuration: Uniform;
  previousBreakChanceTime: number = 0;

  constructor(simulationRules: SimulationOptions, options?: any) {
    super(options);

    this.rules = simulationRules;

    this.boxGenerationInterval = new Exponential(
      3600 /* per hour */ / simulationRules.ordersPerHour
    );
    this.timeEnd = 3600 * 24 * this.rules.totalSimulationTimeDays;

    this.helpers = new Uniform(
      this.rules.helpersM - this.rules.helpersD,
      this.rules.helpersM + this.rules.helpersD
    );
    this.breakDuration = new Uniform(
      (this.rules.randomBreakDurationM - this.rules.randomBreakDurationD) * 60,
      (this.rules.randomBreakDurationM + this.rules.randomBreakDurationD) * 60
    );

    this.rules.managerialInterventionFrequency = this.rules.reactionTime;

    let overloadFactor = this.rules.workTimeM / (60 / this.rules.ordersPerHour);
    if (overloadFactor < 1) {
      this.boxStatistics.setHistogramParameters(
        (simulationRules.workTimeM * 60 * simulationRules.capacity) / 2,
        simulationRules.workTimeM * 60,
        simulationRules.workTimeM * 60 * simulationRules.capacity * 5
      );
    } else {
      this.boxStatistics.setHistogramParameters(
        (simulationRules.workTimeM * 60 * simulationRules.capacity) / 2,
        simulationRules.workTimeM * 60 * 5,
        simulationRules.workTimeM * 60 * simulationRules.capacity * 7
      );
    }

    if (simulationRules.capacity > NAMES.length) {
      throw new Error(
        `Can't have more than ${NAMES.length} workstations or workers.`
      );
    }

    if (simulationRules.rules == 'self' && simulationRules.capacity < 1) {
      throw new Error(
        'There must be at least one workstation and worker for a self-managed simulation.'
      );
    }

    if (
      ['manager', 'kanban'].includes(simulationRules.rules) &&
      simulationRules.capacity < 4
    ) {
      throw new Error(
        'There must be at least four workstations and workers for a managed simulation.'
      );
    }

    for (let i = 0; i < simulationRules.capacity; i++) {
      let w = new Worker(NAMES[i]);
      let ws = new Workstation(
        WORKSTATIONS[i],
        [w],
        simulationRules.workTimeM * 60,
        simulationRules.workTimeD * 60,
        simulationRules.wipLimit,
        simulationRules.reactionTime * 60
      );

      this.workers.push(w);
      this.workstations.push(ws);
    }
  }

  override onStarting() {
    super.onStarting();
    this.generateEntities(Box, this.boxGenerationInterval);
  }

  override onTimeNowChanged(e?: EventArgs | undefined): void {
    super.onTimeNowChanged(e);

    let elapsed = this.timeNow - this.previousBreakChanceTime;
    if (elapsed > BREAK_CHANCE_EVERY) {
      this.previousBreakChanceTime =
        this.timeNow - (elapsed - BREAK_CHANCE_EVERY);

      // The random break probability is thrown per every BREAK_CHANCE_EVERY ms

      // Process random workstation break and fix
      if (!this.brokenWorkstation && this.rules.randomBreakProbability > 0) {
        if (Math.random() < this.rules.randomBreakProbability) {
          let index = Math.floor(Math.random() * this.workstations.length);
          let bws = this.workstations[index];
          if (!bws.slow) {
            this.brokenWorkstation = bws;
            this.brokenWorkstation.slow = true;
            this.brokenUntil = this.timeNow + this.breakDuration.sample();
          }
        }
      } else if (!!this.brokenWorkstation && this.brokenUntil! < this.timeNow) {
        this.brokenWorkstation.slow = false;
        this.brokenWorkstation = undefined;
        this.brokenUntil = undefined;
      }
    }

    if (this.rules.rules == 'self') {
      return;
    }

    // Processes simulation business logic
    // ===================================

    // "Manager" rules:
    /*
      If you don't have work in your "inbox", you'll be 
      asked to help out a colleague who is most overloaded now.
      Once you have work in your "inbox", you return home.

      If you have too much work in your "inbox", your N
      least loaded colleagues will be asked to help out. 
      They will continue helping out until your load drops
      below the "overload" point.

      Note: the manager intervenes every with the frequency 
      defined as managerialInterventionFrequency
    */
    if (this.rules.rules == 'manager') {
      // Is it time to intervene?
      if (
        this.latestManagerialIntervention <
        this.timeNow - this.rules.managerialInterventionFrequency * 60
      ) {
        this.latestManagerialIntervention = this.timeNow;
        for (let ws of this.workstations) {
          if (ws.perceivedLoadNow(this.timeNow) == 1) {
            // It's overloaded, try to get help from the least loaded workstations
            let wsLoad = this.workstations
              .map((ws) => {
                return { ws: ws, load: ws.waitQueue.unitsInUse };
              })
              .sort((a, b) => a.load - b.load);

            let helpersToAssign = Math.round(this.helpers.sample());

            // Account for manager's imperfection
            // Select top N underloaded people and pick helpers among them
            wsLoad.length = Math.min(
              wsLoad.length,
              Math.round(helpersToAssign / this.rules.managersPerfection)
            );
            this.shuffle(wsLoad);
            wsLoad.length = Math.min(wsLoad.length, helpersToAssign);

            let wsDonor: { ws: Workstation; load: number };
            for (let wsDonor of wsLoad) {
              if (wsDonor.ws.workers.length) {
                wsDonor.ws.workers[0].workstation = ws;
              }
            }
          } else if (ws.perceivedLoadNow(this.timeNow) == -1) {
            // It's underloaded, push the worker to help others
            if (ws.workers.length) {
              // Find the most loaded workstation
              let wsLoad = this.workstations
                .map((ws) => {
                  return { ws: ws, load: ws.waitQueue.unitsInUse };
                })
                .sort((a, b) => b.load - a.load);

              if (wsLoad.length) {
                let wsRecipient = wsLoad[0];
                ws.workers[0].workstation = wsRecipient.ws;
              }
            }
          } else {
            // It's normal, return all help home
            for (let worker of ws.workers) {
              if (worker.home && worker.home != ws) {
                worker.workstation = worker.home;
              }
            }
          }
        }
      }
    }

    // "Kanban" rules:
    /*
      If you don't have work in your "inbox", you move left.
      When you have work in your "inbox", you go back.

      If you can't push out your work (the next station has 
      too many in their "inbox"), you move right. When the next
      station to your "home" has space, you move back.
    */

    if (this.rules.rules == 'kanban') {
      for (let i = 0; i < this.workstations.length; i++) {
        let ws = this.workstations[i];

        if (ws.perceivedLoadNow(this.timeNow) == 1 && i > 0) {
          // It's overloaded, the previous guy goes right
          let previousWs = this.workstations[i - 1];
          if (previousWs.workers.length) {
            previousWs.workers[0].workstation = ws;
          }
        } else if (
          ws.perceivedLoadNow(this.timeNow) == -1 &&
          i > 0 &&
          ws.workers.length > 0
        ) {
          // It's underloaded, go left
          ws.workers[0].workstation = this.workstations[i - 1];
        } else if (ws.perceivedLoadNow(this.timeNow) == 0) {
          // It's normal, no more help needed
          // Send all help home step-by-step
          for (let worker of ws.workers) {
            if (worker.home && worker.home != ws) {
              // Determine where we need to step - right or left
              let homeIndex = this.workstations.indexOf(worker.home);
              if (homeIndex < i) {
                worker.workstation = this.workstations[i - 1];
              } else if (homeIndex > i) {
                worker.workstation = this.workstations[i + 1];
              }
            }
          }

          /*
          // Just send all help home immediately
          for (let worker of ws.workers) {
            if (worker.home && (worker.home != ws)) {
              worker.workstation = worker.home;
            }
          }
          */
        }
      }
    }
  }

  shuffle(array: any[]) {
    let currentIndex = array.length;

    while (currentIndex != 0) {
      let randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;

      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex],
        array[currentIndex],
      ];
    }
  }
}

export class Box extends Entity<Flow> {
  static nextColor: number = 0;
  color?: string;
  timeStart?: number;
  timeEnd?: number;

  constructor(options?: any) {
    super(options);
    this.color = COLORS[Box.nextColor];
    Box.nextColor++;
    if (Box.nextColor >= COLORS.length) Box.nextColor = 0;
  }

  override async script() {
    let flow: Flow = this.simulation as Flow;

    this.timeStart = flow.timeNow;

    for (let ws of flow.workstations) {
      await ws.process(this);
    }

    this.timeEnd = flow.timeNow;
    flow.boxStatistics.add(+(this.timeEnd - this.timeStart));
  }
}
