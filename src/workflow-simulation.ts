import { Simulation, Entity, Queue, Exponential, Uniform, Tally, RandomVar } from 'simscript';

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

const COLORS = [
  'green',
  'blue',
  'magenta',
  'yellow'
];

export type SimulationRules = 'self' | 'manager' | 'kanban';

export class SimulationOptions {
  capacity: number = 5;
  workTimeM: number = 5;
  workTimeD: number = 3;
  ordersPerHour: number = 10;
  rules: SimulationRules = 'self';
  reactionTime: number = 0.5;
  helpersM: number = 2;
  helpersD: number = 1;
  wipLimit: number = 3;
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
    }

    this._workstation = value;
  }

  name: string;

  constructor(name: string) {
    this.name = name;
  }
}

export class Workstation {
  private _workers: Worker[] = [];
  public get workers(): Worker[]
  { return this._workers; }

  name: string;
  waitQueue: Queue;
  queue: Queue;

  workTimeM: number;
  workTimeD: number;
  work: Uniform;

  private _slow: boolean = false;
  get slow(): boolean { return this._slow; }
  set slow(value: boolean) {
    this._slow = value;
    if (value) {
      this._fast = false;
    }
  }

  _fast: boolean = false;
  get fast(): boolean { return this._fast; }
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
    workTimeD: number = 200
  ) {
    this.name = name;
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
    let timeDelay = this.work.sample();
    if (this.slow) {
      timeDelay *= 10;
    }
    else if (this.fast) {
      timeDelay /= 10;
    }
    await box.delay(timeDelay);
    box.leaveQueue(this.queue);
  }
}

export class Flow extends Simulation {
  workers: Worker[] = [];
  workstations: Workstation[] = [];

  boxGenerationInterval: RandomVar;

  boxStatistics: Tally = new Tally();

  constructor(simulationRules: SimulationOptions, options?: any) {
    super(options);

    this.boxGenerationInterval = new Exponential(3600 /* per hour */ / simulationRules.ordersPerHour);
    this.timeEnd = 3600 * 24 * 10; // 10 days

    this.boxStatistics.setHistogramParameters(
      simulationRules.workTimeM * 60 * simulationRules.capacity / 2,
      simulationRules.workTimeM * 60,
      simulationRules.workTimeM * 60 * simulationRules.capacity * 5
    );

    if (simulationRules.capacity > NAMES.length) {
      throw new Error(
        `Can't have more than ${NAMES.length} workstations or workers.`
      );
    }

    if (simulationRules.capacity < 1) {
      throw new Error('There must be at least one workstation and worker.');
    }

    for (let i = 0; i < simulationRules.capacity; i++) {
      let w = new Worker(NAMES[i]);
      let ws = new Workstation(WORKSTATIONS[i], [w], simulationRules.workTimeM * 60, simulationRules.workTimeD * 60);

      this.workers.push(w);
      this.workstations.push(ws);
    }
  }

  override onStarting() {
    super.onStarting();
    this.generateEntities(Box, this.boxGenerationInterval);
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
