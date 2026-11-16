import { Component, OnInit, inject, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { addIcons } from 'ionicons';
import { 
  personCircleOutline, bookOutline, logOutOutline, peopleOutline, 
  settingsOutline, businessOutline, mailOutline, notificationsOutline, 
  personOutline, schoolOutline, analyticsOutline, chevronDownOutline, 
  briefcaseOutline, shieldCheckmarkOutline, helpCircleOutline, calendarOutline
} from 'ionicons/icons';
import { Auth, signOut } from '@angular/fire/auth';
import { 
  IonContent, IonHeader, IonToolbar, 
  IonButtons, IonButton, IonIcon,
  NavController, ToastController, AlertController,
  IonSelect, IonSelectOption, IonLabel, IonPopover, IonList, IonItem
} from '@ionic/angular/standalone';

import { DatabaseService } from '../../services/database';
import { Firestore, collection, query, where, getDocs, doc, getDoc } from '@angular/fire/firestore';
import Chart from 'chart.js/auto'; 

@Component({
  selector: 'app-perfil',
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
  standalone: true,
  imports: [
    IonContent, IonHeader, IonToolbar, CommonModule, FormsModule,
    RouterModule, IonButtons, IonButton, IonIcon, 
    IonSelect, IonSelectOption, IonLabel, IonPopover, IonList, IonItem
  ]
})
export class PerfilPage implements OnInit {
  private router = inject(Router);
  private auth = inject(Auth);
  private navCtrl = inject(NavController); 
  private dbService = inject(DatabaseService); 
  private firestore = inject(Firestore); 
  private toastController = inject(ToastController);
  private alertController = inject(AlertController);
  private cdr = inject(ChangeDetectorRef);

  esTutor: boolean = false;
  usuario = { nombre: 'CARGANDO...', correo: '', sede: '' };
  
  rolUsuario: string = '';
  esAdmin: boolean = false;
  hayNotificacionesSinLeer: boolean = false;
  
  puedePostularse: boolean = true; 

  @ViewChild('barCanvas', { static: false }) private barCanvas!: ElementRef;
  graficoBarras: any;
  totalTutorias: number = 0;
  totalHorasEstudiante: number = 0;

  // 🌟 PUNTO #16: Selector de período académico e histórico
  filtroPeriodo: string = '';
  periodoActualApp: string = '';
  listaPeriodos: string[] = [];

  menuRolAbierto: boolean = false;
  eventoRol: any = null;
  menuPerfilAbierto: boolean = false;
  eventoPerfil: any = null;
  tienePanelTutor: boolean = false;
  tienePanelAdmin: boolean = false;

  constructor() {
    addIcons({
      notificationsOutline, personCircleOutline, mailOutline, businessOutline, 
      bookOutline, settingsOutline, logOutOutline, peopleOutline, personOutline, 
      schoolOutline, analyticsOutline, chevronDownOutline, briefcaseOutline, 
      shieldCheckmarkOutline, helpCircleOutline, calendarOutline
    });
  }

  get iconoRolActual(): string {
    if (this.rolUsuario === 'ADMIN' || this.rolUsuario === 'COORDINADOR') return 'shield-checkmark-outline';
    if (this.rolUsuario === 'TUTOR') return 'briefcase-outline';
    return 'school-outline';
  }

  get nombrePanelActual(): string {
    if (this.rolUsuario === 'ADMIN' || this.rolUsuario === 'COORDINADOR') return 'COORDINACIÓN';
    if (this.rolUsuario === 'TUTOR') return 'TUTOR';
    return 'ESTUDIANTE';
  }

  ngOnInit() {}
  
  async ionViewWillEnter() {
    await this.dbService.cargarConfiguracionGlobal(true);
    this.periodoActualApp = String(this.dbService.periodo_actual || '').trim();
    if (!this.filtroPeriodo) {
      this.filtroPeriodo = this.periodoActualApp || 'HISTORICO';
    }

    const correoGuardado = (localStorage.getItem('correo') || '').toLowerCase().trim();
    if (!correoGuardado) {
      this.navCtrl.navigateRoot('/login');
      return;
    }

    this.usuario.correo = correoGuardado;

    let dataPerfil: any = null;
    let coleccionOrigen = 'Estudiantes';

    const adminSnap = await getDoc(doc(this.firestore, 'Administradores', correoGuardado));
    if (adminSnap.exists()) {
      dataPerfil = adminSnap.data();
      coleccionOrigen = 'Administradores';
      this.puedePostularse = false;
    } else {
      const tutorSnap = await getDoc(doc(this.firestore, 'Tutores', correoGuardado));
      if (tutorSnap.exists()) {
        dataPerfil = tutorSnap.data();
        coleccionOrigen = 'Tutores';
        this.puedePostularse = false;
      } else {
        const estSnap = await getDoc(doc(this.firestore, 'Estudiantes', correoGuardado));
        if (estSnap.exists()) {
          dataPerfil = estSnap.data();
          coleccionOrigen = 'Estudiantes';
          this.puedePostularse = true;
        }
      }
    }

    if (dataPerfil) {
      this.usuario.nombre = (dataPerfil['nombre_completo'] || dataPerfil['nombre'] || 'USUARIO').toUpperCase();
      this.usuario.sede = (dataPerfil['sede'] || 'CUENCA').toUpperCase();
      this.rolUsuario = (localStorage.getItem('rol') || 'ESTUDIANTE').toUpperCase();
      
      localStorage.setItem('nombre', this.usuario.nombre);
      localStorage.setItem('sede', this.usuario.sede);
    }

    this.esAdmin = (this.rolUsuario === 'ADMIN' || this.rolUsuario === 'COORDINADOR');
    
    if (coleccionOrigen === 'Administradores') {
      this.esTutor = false;
      localStorage.setItem('es_admin_puro', 'true'); 
    } else {
      this.esTutor = (this.rolUsuario === 'TUTOR' || this.rolUsuario === 'COORDINADOR');
      localStorage.setItem('es_admin_puro', 'false');
    }

    await this.verificarNotificaciones(correoGuardado, this.rolUsuario, this.usuario.sede);
    await this.cargarPermisosPaneles(correoGuardado); 
    
    setTimeout(() => { this.cargarEstadisticasEstudiante(); }, 300);
  }

  async cargarPermisosPaneles(correo: string) {
    this.tienePanelTutor = false;
    this.tienePanelAdmin = false;
    if (!correo) return;
    try {
      const permisos = await this.dbService.obtenerPermisosPaneles(correo);
      this.tienePanelTutor = permisos.tienePanelTutor;
      this.tienePanelAdmin = permisos.tienePanelAdmin;
      if (this.tienePanelTutor) this.puedePostularse = false;
    } catch (error) {
      console.error("Error cargando permisos:", error);
    }
    if (this.cdr) this.cdr.detectChanges(); 
  }

  abrirMenuRol(evento: any) { this.eventoRol = evento; this.menuRolAbierto = true; }
  abrirMenuPerfil(evento: any) { this.eventoPerfil = evento; this.menuPerfilAbierto = true; }
  irAPanel(ruta: string, rolDestino: string) { this.menuRolAbierto = false; localStorage.setItem('rol', rolDestino); setTimeout(() => { this.router.navigate([ruta]); }, 150); }
  irAPerfil() { this.menuPerfilAbierto = false; }
  async cerrarSesion() { this.menuPerfilAbierto = false; try { await signOut(this.auth); localStorage.clear(); this.navCtrl.navigateRoot('/login'); } catch (error) { localStorage.clear(); this.navCtrl.navigateRoot('/login'); } }

  // ==========================================================================
  // 🌟 PUNTO #16: ESTADÍSTICAS DEL ESTUDIANTE FILTRADAS POR PERÍODO / HISTÓRICO
  // ==========================================================================
  async cargarEstadisticasEstudiante() {
    try {
      const correoLimpio = this.usuario.correo.toLowerCase().trim();

      // Consultamos tanto Asistencias (impartidas) como Reservas (agendadas/confirmadas)
      const [snapAsistencias, snapReservas] = await Promise.all([
        getDocs(query(collection(this.firestore, 'Asistencias'), where('correo_estudiante', '==', correoLimpio))),
        getDocs(query(collection(this.firestore, 'Reservas'), where('correoEstudiante', '==', correoLimpio)))
      ]);

      const periodosSet = new Set<string>();
      if (this.periodoActualApp) periodosSet.add(this.periodoActualApp);

      const registros: { materia: string; periodo: string; minutos: number }[] = [];

      snapAsistencias.forEach(d => {
        const data = d.data();
        const per = String(data['periodo'] || this.periodoActualApp || '').trim();
        if (per) periodosSet.add(per);
        const mins = (Number(data['horas_duracion'] || 0) * 60) + Number(data['minutos_duracion'] || 0);
        registros.push({
          materia: data['materia'] || 'Otra',
          periodo: per,
          minutos: mins > 0 ? mins : 60
        });
      });

      snapReservas.forEach(d => {
        const data = d.data();
        const estado = String(data['estado'] || '').toUpperCase();
        if (estado === 'RECHAZADA' || estado === 'CANCELADA') return;
        const per = String(data['periodo'] || this.periodoActualApp || '').trim();
        if (per) periodosSet.add(per);
        const mins = Number(data['duracion_horas'] || 1) * 60;
        registros.push({
          materia: data['materia'] || 'Otra',
          periodo: per,
          minutos: mins
        });
      });

      this.listaPeriodos = Array.from(periodosSet).filter(Boolean).sort().reverse();
      if (!this.filtroPeriodo) {
        this.filtroPeriodo = this.periodoActualApp || 'HISTORICO';
      }

      const filtrados = this.filtroPeriodo === 'HISTORICO'
        ? registros
        : registros.filter(r => r.periodo === this.filtroPeriodo);

      this.totalTutorias = filtrados.length;
      const totalMinutos = filtrados.reduce((acc, r) => acc + r.minutos, 0);
      this.totalHorasEstudiante = Math.round((totalMinutos / 60) * 10) / 10;

      const conteoMaterias: { [key: string]: number } = {};
      filtrados.forEach(r => {
        conteoMaterias[r.materia] = (conteoMaterias[r.materia] || 0) + 1;
      });

      const labels = Object.keys(conteoMaterias);
      const dataGrafico = Object.values(conteoMaterias);
      this.generarGraficoBarras(labels, dataGrafico);
      if (this.cdr) this.cdr.detectChanges();
    } catch (error) {
      console.error('Error cargando estadísticas estudiante:', error);
    }
  }

  generarGraficoBarras(labels: string[], data: number[]) {
    if (this.graficoBarras) this.graficoBarras.destroy();
    if (!this.barCanvas || labels.length === 0) return;
    this.graficoBarras = new Chart(this.barCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{ label: 'Tutorías Recibidas', data: data, backgroundColor: '#003366', borderRadius: 6 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
  }

  async verificarNotificaciones(correo: string, rol: string, sede: string) {
    try {
      const panelContexto = this.rolUsuario === 'TUTOR' ? 'TUTOR' : 'ESTUDIANTE';
      const notifs = await this.dbService.obtenerNotificacionesUsuario(correo, rol, sede, panelContexto);
      const sinLeer = notifs.filter((n: any) => !n['leida_por']?.includes(correo));
      this.hayNotificacionesSinLeer = sinLeer.length > 0;
    } catch (error) {}
  }
  
  irANotificaciones() { 
    const panelContexto = this.rolUsuario === 'TUTOR' ? 'TUTOR' : 'ESTUDIANTE';
    this.router.navigate(['/notificaciones'], { queryParams: { panel: panelContexto } }); 
  }
  
  irAPostulacion() { this.router.navigate(['/tabs/postulacion']); }

  async mostrarAviso(mensaje: string, tipo: 'exito' | 'error' | 'advertencia' | 'info' = 'exito') {
    let icono = 'checkmark-circle-outline'; let claseCss = 'toast-exito';
    if (tipo === 'error') { icono = 'close-circle-outline'; claseCss = 'toast-error'; } 
    else if (tipo === 'advertencia') { icono = 'warning-outline'; claseCss = 'toast-advertencia'; } 
    else if (tipo === 'info') { icono = 'information-circle-outline'; claseCss = 'toast-info'; }
    const toast = await this.toastController.create({ message: mensaje, duration: 3000, position: 'top', icon: icono, cssClass: `toast-premium-gietaes ${claseCss}`, mode: 'ios' });
    await toast.present();
  }

  async confirmarAccion(cabecera: string, mensaje: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      const alert = await this.alertController.create({
        header: cabecera, message: mensaje, cssClass: 'alerta-premium-gietaes', mode: 'md', 
        buttons: [
          { text: 'Cancelar', role: 'cancel', cssClass: 'btn-alerta-cancelar', handler: () => resolve(false) },
          { text: 'Sí, Continuar', cssClass: 'btn-alerta-confirmar', handler: () => resolve(true) }
        ]
      });
      await alert.present();
    });
  }
}