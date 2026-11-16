import { Component, EnvironmentInjector, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { calendarOutline, checkboxOutline, megaphoneOutline, personOutline } from 'ionicons/icons';
import { TutorEstadoService } from '../../services/tutor-estado.service';

@Component({
  selector: 'app-tabs-tutor',
  templateUrl: './tabs-tutor.page.html',
  styleUrls: ['./tabs-tutor.page.scss'],
  standalone: true,
  imports: [CommonModule, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel]
})
export class TabsTutorPage {
  public environmentInjector = inject(EnvironmentInjector);
  public tutorEstado = inject(TutorEstadoService);

  constructor() {
    addIcons({ calendarOutline, checkboxOutline, megaphoneOutline, personOutline });
  }
}