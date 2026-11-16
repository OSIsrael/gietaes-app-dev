import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { 
  IonContent, IonHeader, IonToolbar, IonButton, IonButtons, 
  IonIcon, ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  arrowBackOutline, notificationsOutline, calendarOutline, 
  documentTextOutline, megaphoneOutline, checkmarkDoneOutline,
  chevronForwardOutline, swapHorizontalOutline
} from 'ionicons/icons';
import { DatabaseService } from '../../services/database';

@Component({
  selector: 'app-notificaciones',
  templateUrl: './notificaciones.page.html',
  styleUrls: ['./notificaciones.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, 
    IonButton, IonButtons, IonIcon
  ]
})
export class NotificacionesPage implements OnInit {
  private dbService = inject(DatabaseService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastController = inject(ToastController);

  notificaciones: any[] = [];
  cargando: boolean = true;
  correoUsuario: string = '';
  rolUsuario: string = '';
  sedeUsuario: string = '';
  
  contextoBandeja: string = 'ESTUDIANTE';

  get haySinLeer(): boolean {
    return this.notificaciones.some(n => !this.esLeida(n));
  }

  constructor() {
    addIcons({
      arrowBackOutline, notificationsOutline, calendarOutline, 
      documentTextOutline, megaphoneOutline, checkmarkDoneOutline,
      chevronForwardOutline, swapHorizontalOutline
    });
  }

  ngOnInit() {
    this.correoUsuario = (localStorage.getItem('correo') || '').toLowerCase().trim();
    this.rolUsuario = localStorage.getItem('rol') || 'ESTUDIANTE';
    this.sedeUsuario = localStorage.getItem('sede') || 'CUENCA';

    this.route.queryParams.subscribe(params => {
      this.contextoBandeja = params['panel'] || 'ESTUDIANTE';
    });
  }

  async ionViewWillEnter() {
    this.cargando = true;
    await this.cargarNotificaciones();
    this.cargando = false;
  }

  async cargarNotificaciones() {
    this.notificaciones = await this.dbService.obtenerNotificacionesUsuario(
      this.correoUsuario,
      this.rolUsuario,
      this.sedeUsuario,
      this.contextoBandeja
    );
  }

  esLeida(notif: any): boolean {
    const leidaPor = notif.leida_por || [];
    return leidaPor.includes(this.correoUsuario);
  }

  // 🌟 PUNTO #11: Marcado masivo en un solo toque
  async marcarTodasLeidas() {
    const cantidad = await this.dbService.marcarTodasComoLeidas(this.correoUsuario, this.contextoBandeja);
    if (cantidad > 0) {
      this.notificaciones = this.notificaciones.map(n => ({
        ...n,
        leida_por: [...new Set([...(n.leida_por || []), this.correoUsuario])]
      }));
      const toast = await this.toastController.create({
        message: `${cantidad} notificación(es) marcada(s) como leída(s).`,
        duration: 2500,
        position: 'top',
        icon: 'checkmark-done-outline',
        cssClass: 'toast-premium-gietaes toast-exito',
        mode: 'ios'
      });
      await toast.present();
    }
  }

  async seleccionarNotificacion(notif: any) {
    if (!this.esLeida(notif)) {
      await this.dbService.marcarNotificacionLeida(notif.id, this.correoUsuario);
      notif.leida_por = [...(notif.leida_por || []), this.correoUsuario];
    }

    const rolDestino = notif.rol_destino || 'ESTUDIANTE';
    const tipo = notif.tipo || '';

    if (rolDestino === 'TUTOR') {
      this.router.navigate(['/tabs-tutor/tutorias']);
    } else if (rolDestino === 'ADMIN' || rolDestino === 'COORDINADOR') {
      this.router.navigate(['/admin-postulaciones']);
    } else {
      if (['TUTORIA', 'RECORDATORIO', 'REPROGRAMACION', 'REASIGNACION'].includes(tipo)) {
        this.router.navigate(['/tabs/mis-tutorias']); 
      } else {
        this.router.navigate(['/tabs/avisos']);
      }
    }
  }

  regresar() {
    if (this.contextoBandeja === 'TUTOR') {
      this.router.navigate(['/tabs-tutor/tutorias']);
    } else if (this.contextoBandeja === 'ADMIN' || this.contextoBandeja === 'COORDINADOR') {
      this.router.navigate(['/admin-postulaciones']);
    } else {
      this.router.navigate(['/tabs/horarios']);
    }
  }

  obtenerIcono(tipo: string): string {
    switch (tipo) {
      case 'TUTORIA':
      case 'REPROGRAMACION': return 'calendar-outline';
      case 'REASIGNACION': return 'swap-horizontal-outline';
      case 'POSTULACION': return 'document-text-outline';
      case 'AVISO': return 'megaphone-outline';
      default: return 'notifications-outline';
    }
  }

  formatearFecha(fechaIso: string): string {
    if (!fechaIso) return '';
    const fecha = new Date(fechaIso);
    return fecha.toLocaleDateString('es-EC', { 
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
    });
  }
}