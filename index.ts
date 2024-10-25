import './style.css';
import {
  SimulationOptions,
  Flow,
  Workstation,
  Box,
} from './workflow-simulation';
import { Animation, Entity, SimulationState } from 'simscript';

declare var Alpine: any;

const MAX_SIMULATION_TIME_STEP = 50;

class SimulationSystemState {
  rules: SimulationOptions = new SimulationOptions();
  kanbanReactionTime: number = 1;
  managerReactionTime: number = 5;

  running: boolean = false;
  paused: boolean = false;
  animate: boolean = true;
  animateSpeed = '50';

  simulationTime: number | undefined = 0;
  orders: number = 0;
  timeThroughSystem: number = 0;
  leftInSystem: number = 0;
  workers: number[] = [];
  slow: boolean[] = [];

  advancedParameters: boolean = false;

  flow: Flow;
  workstations: Workstation[] = [];
  animation?: Animation;

  runSimulation() {
    this.cleanupStats();

    if (this.rules.rules == 'manager') {
      this.rules.reactionTime = this.managerReactionTime;
    } else if (this.rules.rules == 'kanban') {
      this.rules.reactionTime = this.kanbanReactionTime;
    }

    let flags: any = {};
    if (this.animate) {
      flags['maxTimeStep'] = MAX_SIMULATION_TIME_STEP;
      flags['frameDelay'] = +this.animateSpeed;
    }
    else {
      flags['maxTimeStep'] = MAX_SIMULATION_TIME_STEP;
    }

    this.flow = new Flow(this.rules, flags);

    this.flow.stateChanged.addEventListener(() => {
      // The simulation switched from Running to Stopped or vice versa

      // Update the run button
      if (!this.paused) {
        this.running = this.flow?.state == SimulationState.Running;
      }

      // Show stats
      if (!this.running) {
        this.showStats();
      }
    });

    this.flow.timeNowChanged.addEventListener(() => {
      // The simulation time updated
      // Update the queue manpower
      // Update the time indicator
      this.simulationTime = this.flow?.timeNow;
      this.orders = this.flow?.boxStatistics?.cnt;
      this.timeThroughSystem = this.flow?.boxStatistics?.avg;
      this.leftInSystem =
        this.flow.workstations
          .map((ws) => ws.waitQueue.unitsInUse)
          .reduce((a, b) => a + b) +
        this.flow.workstations
          .map((ws) => ws.queue.unitsInUse)
          .reduce((a, b) => a + b);
      this.workers = Alpine.reactive(
        this.workstations.map((ws) => ws.workers.length)
      );
      this.slow = Alpine.reactive(this.workstations.map((ws) => ws.slow));
    });

    this.workstations = this.flow.workstations;

    setTimeout(() => {
      this.updateAnimationState();
      Alpine.raw(this.flow).start();
    });
  }

  stopSimulation() {
    if (this.flow) {
      this.paused = false;
      Alpine.raw(this.flow).stop();
      this.running = false;
      this.showStats();
    }
  }

  pauseSimulation() {
    if (this.flow) {
      this.paused = true;
      Alpine.raw(this.flow).stop();
    }
  }

  resumeSimulation() {
    if (this.flow) {
      this.paused = false;
      if (this.animate) {
        this.flow.maxTimeStep = MAX_SIMULATION_TIME_STEP;
        this.flow.frameDelay = +this.animateSpeed;
      } else {
        this.flow.maxTimeStep = MAX_SIMULATION_TIME_STEP;
        this.flow.frameDelay = null;
      }
      setTimeout(() => {
        this.updateAnimationState();
        Alpine.raw(this.flow).start();
      });
    }
  }

  updateAnimationState() {
    if (this.animate && !this.animation) {
      this.animation = new Animation(
        this.flow,
        document.getElementById('animation-area'),
        {
          getEntityHtml: (e: Entity) => {
            if (e instanceof Box) {
              return `
              <div style="height:10px;width:10px;background-color:${e.color}"></div>`;
            } else {
              return '';
            }
          },
          rotateEntities: false,
          queues: [
            ...this.flow.workstations.map((ws) => {
              return {
                queue: ws.waitQueue,
                element: `#desk${ws.name}`,
                angle: 90,
                max: 12,
              };
            }),
            ...this.flow.workstations.map((ws) => {
              return {
                queue: ws.queue,
                element: `#workstation${ws.name}`,
                angle: 90,
              };
            }),
          ],
        }
      );
    } else if (!this.animate && !!this.animation) {
      this.animation.disabled = true;
    } else if (this.animate && !!this.animation) {
      this.animation.disabled = false;
    }
  }

  showStats() {
    if (!this.flow) return;

    let output = document.getElementById('output');
    if (output) {
      let statistics =
        this.flow.boxStatistics.getHistogramChart('Time in system') +
        this.flow.getStatsTable() +
        '';

      output!.innerHTML = statistics;
    }
  }

  cleanupStats() {
    let output = document.getElementById('output');
    if (output) {
      output.innerHTML = '';
    }

    let animation = document.getElementById('animation-area');

    if (animation) {
      let boxes = animation.querySelectorAll('.ss-entity');
      for (let box of boxes) {
        animation.removeChild(box);
      }
    }
  }

  toggleSlow(ws: Workstation) {
    ws.slow = !ws.slow;
  }

  setProcessingTime(factor: number) {
    this.rules.workTimeM =
      Math.round((60 / this.rules.ordersPerHour) * factor * 10) / 10;
    this.rules.workTimeD = Math.round(this.rules.workTimeM * 0.6 * 10) / 10;
  }
}

let state: SimulationSystemState = new SimulationSystemState();
Alpine.data('state', () => state);
