import {
  Component,
  ElementRef,
  ViewChild,
  CUSTOM_ELEMENTS_SCHEMA,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { Flow, Box, Workstation, SimulationRules, SimulationOptions } from './workflow-simulation';
import { SimulationState, Animation, Entity } from 'simscript';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  imports: [FormsModule, CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  standalone: true,
  template: `
    <h1>Sequential workflow simulation</h1>

    <!-- Select rules of the simulation -->
    <div>
      <div class="section">Simulation rules</div>
      <div>
      <label>
          <input type="radio" name="options" [(ngModel)]="simulationRules.rules" value="self" [disabled]="running">
          Passive
        </label>

        <label>
          <input type="radio" name="options" [(ngModel)]="simulationRules.rules" value="manager" [disabled]="running">
          Manager decides
        </label>

        <label>
          <input type="radio" name="options" [(ngModel)]="simulationRules.rules" value="kanban" [disabled]="running">
          Kanban
        </label>
      </div>
    </div>

    <ng-container  *ngIf="simulationRules.rules == 'kanban'">
      <div class="section">Kanban</div>
      <div>
        <label>
            WIP limit per station, orders
            <input type="number" class="short-number" [disabled]="running" min="1" [(ngModel)]="simulationRules.wipLimit">
        </label>
      </div>
      <div>
        <label>
            Employee's reaction time, minutes
            <input type="number" class="short-number" [disabled]="running" min="0"  [(ngModel)]="kanbanReactionTime">
        </label>
      </div>
    </ng-container>

    <ng-container  *ngIf="simulationRules.rules == 'manager'">
      <div class="section">Manager</div>
      <div>
        <label>
            Overload sensitivity, orders
            <input type="number" class="short-number" [disabled]="running" [(ngModel)]="simulationRules.wipLimit">
        </label>
      </div>
      <div>
        <label>
            Manager's reaction time, minutes
            <input type="number" class="short-number" [disabled]="running" min="0" [(ngModel)]="managerReactionTime"><br>
        </label>
      </div>
      <div>
        <label>
            How many helpers to assign, people
            <input type="number" class="short-number" [disabled]="running" [(ngModel)]="simulationRules.helpersM">
        </label>
        <label>
            ±
            <input type="number" class="short-number" [disabled]="running" [(ngModel)]="simulationRules.helpersD">
        </label>
      </div>
    </ng-container>

    <div>
      <div class="section">Workstations</div>
      <div>
        <label>
            How many workstations to simulate?
            <input type="number" class="short-number" min="4" max="26" [(ngModel)]="simulationRules.capacity" (ngModelChange)="createSimulation()" [disabled]="running">
        </label>
      </div>

      <div>
        <label>
            Processing time, minutes
            <input type="number" class="short-number" min="0" [(ngModel)]="simulationRules.workTimeM" [disabled]="running">
        </label>
        <label>
            ±
            <input type="number" class="short-number" min="0" [(ngModel)]="simulationRules.workTimeD" [disabled]="running">
        </label>
      </div>

      <div>
        <button (click)="setProcessingTime(5/6)">Normal</button>
        <button (click)="setProcessingTime(1.01)">Hard</button>
        <button (click)="setProcessingTime(1.2)">Insane</button>
    </div>
    </div>

    <div>
      <div class="section">Orders</div>
      <div>
        <label>
            Orders per hour
            <input type="number" [(ngModel)]="simulationRules.ordersPerHour">
        </label>
      </div>
    </div>

    <div class="section">Simulation</div>
    <div>
      <label>
          Animate
          <input type="checkbox" [(ngModel)]="animate" [disabled]="running && !paused">
      </label>
    </div>
    <div *ngIf="animate">
      <label>
        <input type="radio" name="speed" [(ngModel)]="animateSpeed" value="5" [disabled]="running && !paused">
        Ultra-fast
      </label>

      <label>
        <input type="radio" name="speed" [(ngModel)]="animateSpeed" value="20" [disabled]="running && !paused">
        Fast
      </label>

      <label>
        <input type="radio" name="speed" [(ngModel)]="animateSpeed" value="50" [disabled]="running && !paused">
        Normal
      </label>

      <label>
        <input type="radio" name="speed" [(ngModel)]="animateSpeed" value="100" [disabled]="running && !paused">
        Slow
      </label>
    </div>
    <button *ngIf="!running" (click)="runSimulation()"><strong>Start</strong></button>
    <button *ngIf="running" (click)="stopSimulation()">Stop</button>
    <button *ngIf="running && !paused" (click)="pauseSimulation()">Pause</button>
    <button *ngIf="running && paused" (click)="resumeSimulation()">Resume</button>

    <div class="simulation-area" *ngIf="animate">
      <svg #animation class="animation-host" viewBox="0 0 1000 500">
        <g *ngFor="let ws of flow?.workstations; let i=index">
          <!-- Inbound desk -->
            <!-- Desk image -->
            <rect 
              fill="none"
              stroke-width="8"
              stroke="black"
              [attr.x]="(wsSpacing + i*(wsSpacing+deskWidth+wsWidth)) * 10"
              y="395" 
              [attr.width]="(deskWidth*10)" 
              height="5" />
            <!-- Desk top -->
            <rect 
              id="desk{{ws.name}}"
              fill="none"
              stroke-width="0"
              [attr.x]="(wsSpacing + i*(wsSpacing+deskWidth+wsWidth)) * 10"
              y="385" 
              [attr.width]="(deskWidth) * 10" 
              height="10" />


          <!-- Workstation -->
            <ng-container *ngIf="ws.workers.length">
              <g 
                [attr.transform]="'translate(' + (wsSpacing + deskWidth + i*(wsSpacing+deskWidth+wsWidth)) * 10 +',' + '450)'"
                fill='black' 
                stroke='black' 
                opacity='0.8' 
                transform='scale(1,0.8)'>
                    <circle cx='1%' cy='1%' r='0.5%' fill='orange'></circle>
                    <rect x='.4%' y='2%' width='1.3%' height='4%' fill='green' rx='0.7%'></rect>
                    <rect x='.66%' y='4%' width='.8%' height='3%' fill='blue'></rect>
                    <rect x='.4%' y='7%' width='1.3%' height='.75%' rx='0.5%'></rect>

                    <text 
                      x="30" y="30"
                      height="25"
                      [attr.font-size]="9+135/simulationRules.capacity"
                  >          
                  x{{ ws.workers.length }}
                  </text>
              </g>
            </ng-container>
            <rect (click)="workstationClick(ws)"
              [attr.fill]="ws.slow? 'red': ws.fast? 'green': 'blue'"
              stroke-width="8"
              stroke="black"
              [attr.x]="(wsSpacing + deskWidth + i*(wsSpacing+deskWidth+wsWidth)) * 10"
              y="350" 
              [attr.width]="(wsWidth) * 10" 
              height="50" />
            <rect 
              id="workstation{{ws.name}}"
              fill="none"
              stroke-width="0"
              [attr.x]="(wsSpacing + deskWidth + i*(wsSpacing+deskWidth+wsWidth)) * 10"
              y="340" 
              [attr.width]="(wsWidth) * 10" 
              height="10" />

          <!-- Workstation name -->
          <text 
            [attr.x]="(wsSpacing + i*(wsSpacing+deskWidth+wsWidth) + deskWidth/3) * 10"
            y="440"
            height="25"
            [attr.textLength]="(deskWidth + wsWidth - 2*deskWidth/3) * 10" 
            [attr.font-size]="9+135/simulationRules.capacity"
            >
            
            {{ ws.name }}
          </text>

        </g>
      </svg>
    </div>  

    <div class="simulation-statistics">
      <div class="section">Simulation statistics</div>
      <div>Simulation time: {{ simulationTime }}</div>
      <div>Orders: {{ flow?.boxStatistics?.cnt }}</div>
      <div>Average time: {{ flow?.boxStatistics?.avg }}</div>
      <div #output></div>
    </div>
  `,
})
export class App {
  @ViewChild('output') output?: ElementRef;
  @ViewChild('animation') animation?: ElementRef;

  public simulationRules: SimulationOptions = new SimulationOptions();
  public managerReactionTime = 5;
  public kanbanReactionTime = 1;

  public wsSpacing: number = 2;
  public deskWidth: number = 0;
  public wsWidth: number = 0;
  public boxWidth: number = 0;

  public flow?: Flow;
  public running: boolean = false;
  public paused: boolean = false;
  public animate: boolean = true;
  public animateSpeed = "50";
  public simulationTime: number | undefined = 0;

  constructor() {
    this.createSimulation();
  }

  async runSimulation() {
    this.createSimulation();
    this.cleanupStats();

    setTimeout(() => {
      if (!this.flow) return;

      if (this.animate) {
        new Animation(this.flow, this.animation?.nativeElement, {
          getEntityHtml: (e: Entity) => {
            if (e instanceof Box) {
              return `
                    <g class='order' fill='chocolate' stroke='chocolate' stroke-width="1%" opacity='0.8'>
                        <rect x='0' y='0' width='40' height='40' fill='${e.color}'>
                        </rect>
                        <line x1="40" y1="0" x2="0" y2="40" style="stroke:chocolate;stroke-width:1%" />
                    </g>`;
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
        });
      }

      this.flow.start();
    });
  }

  createSimulation() {
    this.recalculateMetrics();

    let options: any = {};

    if (this.animate) {
      options['maxTimeStep'] = 10;
      options['frameDelay'] = +this.animateSpeed;
    }

    if (this.simulationRules.rules == 'manager') {
      this.simulationRules.reactionTime = this.managerReactionTime;
    }
    else if (this.simulationRules.rules == 'kanban') {
      this.simulationRules.reactionTime = this.kanbanReactionTime;
    }

    this.flow = new Flow(this.simulationRules, options);

    this.flow.stateChanged.addEventListener(() => {
      // The simulation switched from Running to Stopped or vice versa
      console.warn('State changed');

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
    });
  }

  stopSimulation() {
    if (this.flow) {
      this.paused = false;
      this.flow.stop();
      this.running = false;
      this.showStats();
    }
  }

  pauseSimulation() {
    if (this.flow) {
      this.paused = true;
      this.flow.stop();
    }
  }

  resumeSimulation() {
    if (this.flow) {
      this.paused = false;
      if (this.animate) {
        this.flow.maxTimeStep = 10;
        this.flow.frameDelay = +this.animateSpeed;
      }
      else {
        this.flow.maxTimeStep = 10;
        this.flow.frameDelay = null;
      }
      this.flow.start();
    }
  }

  workstationClick(ws: Workstation) {
    ws.slow = !ws.slow;
  }

  showStats() {
    if (!this.flow) return;

    if (this.output) {
     
      let statistics =
      this.flow.boxStatistics.getHistogramChart('Time in system') +
      this.flow.getStatsTable() +
      '';

      this.output!.nativeElement.innerHTML = statistics;
    }
  }

  cleanupStats() {
    if (this.output) {
      this.output.nativeElement.innerHTML = '';
    }

    if (this.animation) {
      let boxes = this.animation.nativeElement.querySelectorAll('.ss-entity');
      for (let box of boxes) { this.animation.nativeElement.removeChild(box); }
    }
  }
  
  recalculateMetrics(value?: string) {
    this.simulationTime = 0;

    if (value) {
      this.simulationRules.capacity = +value;
    }

    if (this.simulationRules.capacity > 0) {
      this.wsSpacing = this.simulationRules.capacity < 10 ? 5 : 2;
      let spaceForDesks = 100 - (this.simulationRules.capacity + 1) * this.wsSpacing;
      let areaWidth = spaceForDesks / this.simulationRules.capacity;
      this.deskWidth = areaWidth / 2;
      this.wsWidth = areaWidth / 2;
      this.boxWidth = this.deskWidth / 2;
    }
  }

  setProcessingTime(factor: number) {
    this.simulationRules.workTimeM = Math.round((60 / this.simulationRules.ordersPerHour) * factor * 10) / 10;
    this.simulationRules.workTimeD = Math.round(this.simulationRules.workTimeM * 0.6 * 10) / 10;
  }

}

bootstrapApplication(App, {
  providers: [{ provide: FormsModule, useClass: FormsModule }],
});
