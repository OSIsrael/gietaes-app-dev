import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { 
  IonContent, IonHeader, IonToolbar, IonIcon, IonButton, IonButtons,
  IonItem, IonLabel, IonSelect, IonSelectOption, IonTextarea, IonInput, IonList,
  ToastController, AlertController, IonPopover, IonModal, IonDatetime
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  documentTextOutline, sendOutline, notificationsOutline, 
  personOutline, personCircle, bookOutline, timeOutline, schoolOutline,
  checkmarkCircleOutline, chatbubblesOutline, gitNetworkOutline, barcodeOutline,
  peopleOutline, trashOutline, closeCircle, helpCircleOutline, swapHorizontalOutline, 
  closeOutline, briefcaseOutline, shieldCheckmarkOutline, personCircleOutline, 
  chevronDownOutline, settingsOutline, logOutOutline, starOutline, star,
  createOutline, businessOutline, searchOutline, calendarOutline,
  arrowForwardCircleOutline, checkmarkDoneCircleOutline, repeatOutline, checkmarkOutline
} from 'ionicons/icons';
import { Firestore, doc, getDoc, collection, getDocs, deleteDoc, setDoc, addDoc } from '@angular/fire/firestore';
import { DatabaseService } from '../../services/database';
import { TutorEstadoService } from '../../services/tutor-estado.service';
import { Auth, signOut } from '@angular/fire/auth';

@Component({
  selector: 'app-tutor-asistencia',
  templateUrl: './tutor-asistencia.page.html',
  styleUrls: ['./tutor-asistencia.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, 
    IonIcon, IonButton, IonButtons, IonItem, IonLabel, 
    IonSelect, IonSelectOption, IonTextarea, IonInput, IonList, 
    IonPopover, IonModal, IonDatetime
  ]
})
export class TutorAsistenciaPage implements OnInit {
  private dbService = inject(DatabaseService);
  private tutorEstado = inject(TutorEstadoService);
  private firestore = inject(Firestore);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private auth = inject(Auth);

  private toastController = inject(ToastController);
  private alertController = inject(AlertController);

  correoTutor: string = '';
  nombreTutor: string = '';
  carreraTutor: string = '';
  rolUsuario: string = 'ESTUDIANTE';
  sedeUsuario: string = '';
  nombreUsuario: string = '';
  correoUsuario: string = '';

  menuRolAbierto: boolean = false;
  eventoRol: any = null;
  menuPerfilAbierto: boolean = false;
  eventoPerfil: any = null;

  tienePanelTutor: boolean = false;
  tienePanelAdmin: boolean = false;
  hayNotificacionesSinLeer: boolean = false;

  estudiantes: any[] = [];
  docentesExcel: string[] = [];
  materiasTutor: string[] = [];
  cargando: boolean = true;
  enviando: boolean = false;
  tutoriaPreCargada: boolean = false;
  busquedaEstudiante: string = '';
  estudiantesFiltrados: any[] = [];
  estudiantesSeleccionados: any[] = [];
  estudiantesInvitados: any[] = []; 

  // Trazabilidad Punto #18 heredada de la reserva
  fechaAgendamientoOriginal: string | null = null;
  fechaModificacionTutorOriginal: string | null = null;

  // Variables exclusivas para Tutoría de Proceso (Puntos #5, #8, #9, #10)
  accionProceso: 'CONTINUAR' | 'FINALIZAR' | '' = '';
  mostrarModalProceso: boolean = false;
  sesionProcesoConfirmada: boolean = false;
  fechaSiguienteProceso: string = '';
  horaInicioProceso: string = '09:00';
  horaFinProceso: string = '10:00';
  modalidadSiguienteProceso: string = 'Presencial';
  fechaMinimaHoy: string = '';
  fechaTutoriaOriginalISO: string = '';
  fechaMinimaSiguienteProceso: string = '';

  horasDisponiblesProceso: string[] = [
    '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
    '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'
  ];

  // 🌟 PUNTO #9: Bloquear domingos y fechas anteriores o iguales a la tutoría original
  fechasPermitidasProceso = (dateString: string): boolean => {
    const soloFecha = String(dateString || '').split('T')[0];
    if (this.fechaTutoriaOriginalISO && soloFecha <= this.fechaTutoriaOriginalISO) {
      return false;
    }
    const fecha = new Date(`${soloFecha}T00:00:00`);
    return fecha.getDay() !== 0;
  };

  form = {
    materia: '',
    tema_tratado: '',
    horas_duracion: 1, 
    minutos_duracion: 0,
    asistio: '',
    participo: '',
    codigo_tutoria: '',
    calificacion_tutor: 0,
    tipo_tutoria: 'CONSULTA',
    motivo_cambio_tipo: '',
    espacio_fisico: '',
    duracion_ios: '01:00',
    modalidad: 'Presencial'
  };

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

  // 🌟 PUNTO #7: Verificar si al menos un estudiante asistió o si todos faltaron
  get huboAsistencia(): boolean {
    const todos = [...this.estudiantesSeleccionados, ...this.estudiantesInvitados];
    return todos.some(e => e.asistio === 'SI');
  }

  get todosAusentes(): boolean {
    const todos = [...this.estudiantesSeleccionados, ...this.estudiantesInvitados];
    return todos.length > 0 && todos.every(e => e.asistio === 'NO');
  }

  // 🌟 PUNTO #3: Detectar duración 0h 0min
  get duracionEsCero(): boolean {
    const h = Number(this.form.horas_duracion || 0);
    const m = Number(this.form.minutos_duracion || 0);
    return h <= 0 && m <= 0;
  }

  // 🌟 PUNTO #8: Horas de fin válidas (estrictamente mayores a la hora de inicio)
  get horasFinDisponiblesProceso(): string[] {
    const minInicio = this.convertirHoraAMinutos(this.horaInicioProceso);
    return this.horasDisponiblesProceso.filter(h => this.convertirHoraAMinutos(h) > minInicio);
  }

  get horarioProcesoEsValido(): boolean {
    return this.convertirHoraAMinutos(this.horaFinProceso) > this.convertirHoraAMinutos(this.horaInicioProceso);
  }

  // 🌟 PUNTO #10: Detectar si hay estudiantes de otra sede unidos
  get hayEstudiantesOtraSede(): boolean {
    const sedeTutorNorm = this.normalizarTexto(this.sedeUsuario);
    if (!sedeTutorNorm) return false;

    const todos = [...this.estudiantesSeleccionados, ...this.estudiantesInvitados];
    return todos.some(est => {
      if (est.asistio === 'NO') return false;
      const sedeEstNorm = this.normalizarTexto(est.sede);
      return sedeEstNorm !== '' && sedeEstNorm !== sedeTutorNorm;
    });
  }

  constructor() {
    addIcons({
      starOutline, star, personCircleOutline, personCircle, swapHorizontalOutline,
      notificationsOutline, bookOutline, documentTextOutline, timeOutline, barcodeOutline,
      peopleOutline, personOutline, trashOutline, schoolOutline, gitNetworkOutline,
      sendOutline, closeOutline, briefcaseOutline, shieldCheckmarkOutline, helpCircleOutline,
      checkmarkCircleOutline, chatbubblesOutline, closeCircle, chevronDownOutline,
      settingsOutline, logOutOutline, createOutline, businessOutline, searchOutline,
      calendarOutline, arrowForwardCircleOutline, checkmarkDoneCircleOutline, repeatOutline,
      checkmarkOutline
    });
  }

  ngOnInit() { }

  async ionViewWillEnter() {
    this.tutorEstado.habilitarTabAsistencia();

    const hoy = new Date();
    this.fechaMinimaHoy = this.formatearDateAISO(hoy);
    this.fechaTutoriaOriginalISO = this.fechaMinimaHoy;
    this.fechaMinimaSiguienteProceso = this.sumarDiasISO(this.fechaTutoriaOriginalISO, 1, true);

    this.correoUsuario = (localStorage.getItem('correo') || '').toLowerCase().trim();
    this.nombreUsuario = localStorage.getItem('nombre') || '';
    this.correoTutor = this.correoUsuario;
    this.nombreTutor = this.nombreUsuario;
    this.carreraTutor = localStorage.getItem('carrera') || '';
    this.rolUsuario = (localStorage.getItem('rol') || 'TUTOR').toUpperCase();
    this.sedeUsuario = (localStorage.getItem('sede') || 'CUENCA').toUpperCase();

    await this.cargarPermisosPaneles(this.correoUsuario);

    const state = history.state;
    if (state && state.tutoriaMaster) {
      this.estudiantesSeleccionados = []; 
      this.estudiantesInvitados = []; 
      this.accionProceso = '';
      this.sesionProcesoConfirmada = false;
      this.fechaSiguienteProceso = '';
      this.preCargarClase(state.tutoriaMaster);
      history.replaceState({}, '');
    }

    await this.verificarNotificaciones();
    await this.cargarDatos();
  }

  ionViewWillLeave() {
    this.tutorEstado.ocultarTabAsistencia();
  }

  normalizarTexto(valor: string): string {
    return String(valor || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  convertirHoraAMinutos(horaStr: string): number {
    const partes = String(horaStr || '0:0').split(':').map(Number);
    const h = isNaN(partes[0]) ? 0 : partes[0];
    const m = isNaN(partes[1]) ? 0 : partes[1];
    return h * 60 + m;
  }

  formatearDateAISO(fecha: Date): string {
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  sumarDiasISO(fechaISO: string, dias: number, evitarDomingo: boolean = false): string {
    const partes = String(fechaISO || this.fechaMinimaHoy).split('T')[0].split('-').map(Number);
    const base = partes.length === 3
      ? new Date(partes[0], partes[1] - 1, partes[2])
      : new Date();
    base.setDate(base.getDate() + dias);
    if (evitarDomingo && base.getDay() === 0) {
      base.setDate(base.getDate() + 1);
    }
    return this.formatearDateAISO(base);
  }

  // 🌟 PUNTO #9: Extraer fecha ISO (YYYY-MM-DD) de la tutoría original
  extraerFechaOriginalISO(master: any): string {
    const candidato = String(master?.fecha_exacta || '').trim();
    if (candidato) {
      // Formato ISO YYYY-MM-DD
      const soloFecha = candidato.split('T')[0];
      const partesISO = soloFecha.split('-').map(Number);
      if (partesISO.length === 3 && !isNaN(partesISO[0]) && !isNaN(partesISO[1]) && !isNaN(partesISO[2])) {
        return `${partesISO[0]}-${String(partesISO[1]).padStart(2, '0')}-${String(partesISO[2]).padStart(2, '0')}`;
      }

      // Formato DD/MM/YYYY
      const partesSlash = soloFecha.split('/').map(Number);
      if (partesSlash.length === 3 && !isNaN(partesSlash[0]) && !isNaN(partesSlash[1]) && !isNaN(partesSlash[2])) {
        return `${partesSlash[2]}-${String(partesSlash[1]).padStart(2, '0')}-${String(partesSlash[0]).padStart(2, '0')}`;
      }

      // Formato texto español "20 de noviembre"
      const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const matchTexto = candidato.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/(\d{1,2})\s+de\s+([a-z]+)/);
      if (matchTexto) {
        const diaNum = parseInt(matchTexto[1], 10);
        const mesIdx = meses.indexOf(matchTexto[2]);
        if (mesIdx !== -1 && !isNaN(diaNum)) {
          const ahora = new Date();
          const fechaObj = new Date(ahora.getFullYear(), mesIdx, diaNum);
          if (fechaObj.getTime() < ahora.getTime() - (180 * 24 * 60 * 60 * 1000)) {
            fechaObj.setFullYear(ahora.getFullYear() + 1);
          }
          return this.formatearDateAISO(fechaObj);
        }
      }
    }

    return this.fechaMinimaHoy || this.formatearDateAISO(new Date());
  }

  async cargarPermisosPaneles(correo: string) {
    if (!correo) return;
    try {
      const permisos = await this.dbService.obtenerPermisosPaneles(correo);
      this.tienePanelTutor = permisos.tienePanelTutor;
      this.tienePanelAdmin = permisos.tienePanelAdmin;
    } catch (error) {
      console.error("Error permisos:", error);
    }
    if (this.cdr) this.cdr.detectChanges(); 
  }

  abrirMenuRol(evento: any) { this.eventoRol = evento; this.menuRolAbierto = true; }
  abrirMenuPerfil(evento: any) { this.eventoPerfil = evento; this.menuPerfilAbierto = true; }
  irAPanel(ruta: string, rolDestino: string) { this.menuRolAbierto = false; localStorage.setItem('rol', rolDestino); setTimeout(() => { this.router.navigate([ruta]); }, 150); }
  irAPerfil() { this.menuPerfilAbierto = false; this.router.navigate(['/tabs-tutor/perfil']); }
  async cerrarSesion() { this.menuPerfilAbierto = false; try { await signOut(this.auth); localStorage.clear(); this.router.navigate(['/login']); } catch (error) { localStorage.clear(); this.router.navigate(['/login']); } }

  preCargarClase(master: any) {
    this.tutoriaPreCargada = true;
    this.form.materia = master.materia;
    this.form.codigo_tutoria = master.codigo !== 'SIN CÓDIGO' ? master.codigo : '';
    this.form.modalidad = master.modalidad || 'Presencial';
    this.modalidadSiguienteProceso = master.modalidad || 'Presencial';
    this.form.tipo_tutoria = (master.tipo_tutoria || 'CONSULTA').toUpperCase();
    this.form.motivo_cambio_tipo = master.motivo_cambio_tipo || '';
    this.form.espacio_fisico = master.espacio_fisico || '';
    this.form.horas_duracion = master.duracion_horas || 1;
    this.form.minutos_duracion = 0;
    this.form.duracion_ios = master.duracion_ios || '01:00';

    // 🌟 PUNTO #9: Fijar fecha original y fecha mínima estrictamente posterior
    this.fechaTutoriaOriginalISO = this.extraerFechaOriginalISO(master);
    this.fechaMinimaSiguienteProceso = this.sumarDiasISO(this.fechaTutoriaOriginalISO, 1, true);

    // Trazabilidad Punto #18
    this.fechaAgendamientoOriginal = master.fecha_agendamiento || master.fecha_solicitud || null;
    this.fechaModificacionTutorOriginal = master.fecha_modificacion_tutor || null;

    this.estudiantesSeleccionados.push({
      info: `${master.nombreEstudiante} (Solicitante)`,
      nombre: master.nombreEstudiante,
      correo: String(master.correoEstudiante || '').toLowerCase().trim(),
      celular: master.celularEstudiante || 'No registrado',
      codigoPais: master.codigoPaisEstudiante || '+593',
      sede: (master.sedeEstudiante || master.sede_estudiante || master.sede || '').toUpperCase().trim(),
      idReserva: master.id,
      docente: master.docente || '',
      docentesFiltrados: [],
      derivacion: master.tipoDerivacion || 'DECISIÓN PROPIA',
      asistio: 'SI',
      participo: 'SI'
    });

    if (master.alumnosExtra && master.alumnosExtra.length > 0) {
      master.alumnosExtra.forEach((extra: any) => {
        this.estudiantesInvitados.push({
          info: `${extra.nombreEstudiante}`, 
          nombre: extra.nombreEstudiante,
          correo: String(extra.correoEstudiante || '').toLowerCase().trim(),
          celular: extra.celularEstudiante || 'No registrado',
          codigoPais: extra.codigoPaisEstudiante || '+593',
          sede: (extra.sedeEstudiante || extra.sede_estudiante || extra.sede || '').toUpperCase().trim(),
          idReserva: extra.id,
          docente: extra.docente || '',
          docentesFiltrados: [],
          derivacion: extra.tipoDerivacion || 'DECISIÓN PROPIA',
          asistio: 'SI',
          participo: 'SI'
        });
      });
    }

    // 🌟 PUNTO #10: Si hay estudiantes de otra sede, forzar Virtual
    if (this.hayEstudiantesOtraSede) {
      this.modalidadSiguienteProceso = 'Virtual';
    }

    if (this.cdr) this.cdr.detectChanges();
  }

  async cargarDatos() {
    this.cargando = true;
    try {
      await this.dbService.cargarConfiguracionGlobal(true);
      const tutorSnap = await getDoc(doc(this.firestore, 'Tutores', this.correoTutor));
      if (tutorSnap.exists()) {
        this.materiasTutor = tutorSnap.data()['materias'] || [];
      }
      const snapEstudiantes = await getDocs(collection(this.firestore, 'Estudiantes'));
      this.estudiantes = snapEstudiantes.docs.map(docSnap => docSnap.data());

      // 🌟 PUNTO #10: Completar la sede de cada estudiante precargado desde colección Estudiantes
      const mapaSedes = new Map<string, string>();
      this.estudiantes.forEach(e => {
        const c = String(e.correo_google || e.correo || '').toLowerCase().trim();
        if (c && e.sede) {
          mapaSedes.set(c, String(e.sede).toUpperCase().trim());
        }
      });

      [...this.estudiantesSeleccionados, ...this.estudiantesInvitados].forEach(est => {
        if (!est.sede && est.correo && mapaSedes.has(est.correo)) {
          est.sede = mapaSedes.get(est.correo);
        }
      });

      if (this.hayEstudiantesOtraSede) {
        this.modalidadSiguienteProceso = 'Virtual';
      }

      this.docentesExcel = await this.dbService.obtenerDocentesDesdeExcel(this.sedeUsuario);
    } catch (e) {
      console.error(e);
    } finally {
      this.cargando = false;
      if (this.cdr) this.cdr.detectChanges();
    }
  }

  async verificarNotificaciones() {
    try {
      const notifs = await this.dbService.obtenerNotificacionesUsuario(this.correoTutor, this.rolUsuario, this.sedeUsuario, 'TUTOR');
      const sinLeer = notifs.filter((n: any) => !n['leida_por']?.includes(this.correoTutor));
      this.hayNotificacionesSinLeer = sinLeer.length > 0;
    } catch (error) {}
  }

  irANotificaciones() { this.router.navigate(['/notificaciones'], { queryParams: { panel: 'TUTOR' } }); }

  filtrarEstudiantes() {
    const txt = this.busquedaEstudiante.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!txt) { this.estudiantesFiltrados = []; return; }
    
    this.estudiantesFiltrados = this.estudiantes.filter(e => {
      const textoCompleto = `${e.nombre_completo} ${e.cedula}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return textoCompleto.includes(txt);
    }).slice(0, 5);
  }

  seleccionarEstudiante(est: any) {
    const infoCompletada = `${est.nombre_completo}\n${est.cedula}`;
    if (!this.estudiantesSeleccionados.find(e => e.info === infoCompletada)) {
      this.estudiantesSeleccionados.push({
        info: infoCompletada,
        nombre: est.nombre_completo,
        correo: String(est.correo_google || est.correo || '').toLowerCase().trim(),
        celular: est.celular || 'No registrado',
        codigoPais: est.codigo_pais || '+593',
        sede: String(est.sede || '').toUpperCase().trim(),
        cedula: est.cedula,
        docente: '',
        docentesFiltrados: [],
        derivacion: 'DECISIÓN PROPIA',
        asistio: 'SI',
        participo: 'SI'
      });
    }
    this.busquedaEstudiante = ''; 
    this.estudiantesFiltrados = [];
    this.alCambiarAsistenciaEstudiante();
  }

  removerEstudiante(index: number) {
    this.estudiantesSeleccionados.splice(index, 1);
    this.alCambiarAsistenciaEstudiante();
  }

  // 🌟 PUNTOS #7 y #10: Reaccionar al cambio de asistencia individual
  alCambiarAsistenciaEstudiante() {
    if (this.hayEstudiantesOtraSede) {
      this.modalidadSiguienteProceso = 'Virtual';
    }
    if (this.cdr) this.cdr.detectChanges();
  }

  filtrarDocentesParaEstudiante(est: any) {
    const txt = (est.docente || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!txt) { est.docentesFiltrados = []; return; }
    est.docentesFiltrados = this.docentesExcel.filter(d => 
      d.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(txt)
    ).slice(0, 5);
  }

  seleccionarDocenteParaEstudiante(est: any, docente: string) {
    est.docente = docente;
    est.docentesFiltrados = [];
  }

  alCambiarTipoTutoriaDirecto() {
    if (this.form.tipo_tutoria !== 'PROCESO') {
      this.accionProceso = '';
      this.sesionProcesoConfirmada = false;
      this.fechaSiguienteProceso = '';
    }
  }

  // ==========================================
  // LÓGICA DEL MODAL DE TUTORÍA DE PROCESO (PUNTOS #5, #8, #9, #10)
  // ==========================================
  seleccionarContinuarProceso() {
    this.accionProceso = 'CONTINUAR';

    // 🌟 PUNTO #9: Asegurar fecha mínima estrictamente posterior a la tutoría original
    const baseOriginal = this.fechaTutoriaOriginalISO || this.fechaMinimaHoy;
    this.fechaMinimaSiguienteProceso = this.sumarDiasISO(baseOriginal, 1, true);

    if (!this.fechaSiguienteProceso || this.fechaSiguienteProceso <= baseOriginal) {
      this.fechaSiguienteProceso = this.sumarDiasISO(baseOriginal, 7, true);
    }

    // 🌟 PUNTO #8: Asegurar que horaFinProceso > horaInicioProceso
    if (!this.horarioProcesoEsValido) {
      const opcionesFin = this.horasFinDisponiblesProceso;
      if (opcionesFin.length > 0) {
        this.horaFinProceso = opcionesFin[0];
      }
    }

    // 🌟 PUNTO #10: Si hay estudiantes de otra sede, forzar Virtual
    if (this.hayEstudiantesOtraSede) {
      this.modalidadSiguienteProceso = 'Virtual';
    }

    this.mostrarModalProceso = true;
  }

  seleccionarFinalizarProceso() {
    this.accionProceso = 'FINALIZAR';
    this.sesionProcesoConfirmada = false;
    this.mostrarModalProceso = false;
  }

  alCambiarFechaProceso(evento: any) {
    const valor = evento?.detail?.value;
    if (valor) {
      const fechaElegida = String(valor).split('T')[0];
      this.fechaSiguienteProceso = fechaElegida;
      const diaNombre = this.obtenerNombreDiaDesdeFecha(fechaElegida);
      if (diaNombre === 'Sábado' || this.hayEstudiantesOtraSede) {
        this.modalidadSiguienteProceso = 'Virtual';
      }
    }
  }

  // 🌟 PUNTO #8: Ajustar automáticamente horaFinProceso si queda menor o igual a horaInicioProceso
  alCambiarHoraInicioProceso() {
    const opcionesFin = this.horasFinDisponiblesProceso;
    if (opcionesFin.length > 0 && !this.horarioProcesoEsValido) {
      this.horaFinProceso = opcionesFin[0];
    }
  }

  // 🌟 PUNTO #10: Bloquear selección de Presencial si hay estudiantes de otra sede
  seleccionarModalidadProceso(modalidad: 'Presencial' | 'Virtual') {
    if (modalidad === 'Presencial' && this.hayEstudiantesOtraSede) {
      this.modalidadSiguienteProceso = 'Virtual';
      this.mostrarAviso('No puedes elegir Presencial porque hay estudiantes de otra sede en la tutoría.', 'advertencia');
      return;
    }
    const diaNombre = this.obtenerNombreDiaDesdeFecha(this.fechaSiguienteProceso);
    if (modalidad === 'Presencial' && diaNombre === 'Sábado') {
      this.modalidadSiguienteProceso = 'Virtual';
      this.mostrarAviso('Los sábados solo se permiten tutorías en modalidad Virtual.', 'advertencia');
      return;
    }
    this.modalidadSiguienteProceso = modalidad;
  }

  confirmarDatosSiguienteSesion() {
    if (!this.fechaSiguienteProceso) {
      this.mostrarAviso('Selecciona la fecha en el calendario.', 'advertencia');
      return;
    }

    const fechaLimpia = this.fechaSiguienteProceso.split('T')[0];
    this.fechaSiguienteProceso = fechaLimpia;

    // 🌟 PUNTO #9: Validar que la fecha sea estrictamente posterior a la tutoría original
    if (this.fechaTutoriaOriginalISO && fechaLimpia <= this.fechaTutoriaOriginalISO) {
      this.mostrarAviso(`La fecha debe ser posterior a la tutoría original (${this.formatearFechaCorta(this.fechaTutoriaOriginalISO)}).`, 'advertencia');
      return;
    }

    // 🌟 PUNTO #8: Validar que horaFin > horaInicio
    const minInicio = this.convertirHoraAMinutos(this.horaInicioProceso);
    const minFin = this.convertirHoraAMinutos(this.horaFinProceso);
    const duracionMinutos = minFin - minInicio;

    if (duracionMinutos <= 0) {
      this.mostrarAviso('La hora de fin debe ser mayor a la hora de inicio.', 'advertencia');
      return;
    }
    if (duracionMinutos > 180) {
      this.mostrarAviso('El tiempo máximo por sesión es de 3 horas.', 'advertencia');
      return;
    }

    const diaNombre = this.obtenerNombreDiaDesdeFecha(fechaLimpia);
    if (diaNombre === 'Domingo') {
      this.mostrarAviso('No se pueden agendar tutorías los días domingo.', 'advertencia');
      return;
    }
    if (diaNombre === 'Sábado' && minFin > 13 * 60) {
      this.mostrarAviso('Los sábados solo se permiten tutorías hasta las 13:00.', 'advertencia');
      return;
    }

    // 🌟 PUNTO #10: Forzar Virtual si hay estudiantes de otra sede o si es sábado
    if (diaNombre === 'Sábado' || this.hayEstudiantesOtraSede) {
      this.modalidadSiguienteProceso = 'Virtual';
    }

    this.sesionProcesoConfirmada = true;
    this.mostrarModalProceso = false;
    this.mostrarAviso(`Próxima sesión programada para el ${diaNombre} ${this.formatearFechaCorta(fechaLimpia)}.`, 'exito');
  }

  cerrarModalProceso() {
    this.mostrarModalProceso = false;
    if (!this.sesionProcesoConfirmada) {
      this.accionProceso = '';
    }
  }

  obtenerNombreDiaDesdeFecha(fechaISO: string): string {
    const limpia = (fechaISO || '').split('T')[0];
    const partes = limpia.split('-').map(Number);
    if (partes.length !== 3) return 'Por definir';
    const fecha = new Date(partes[0], partes[1] - 1, partes[2]);
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return dias[fecha.getDay()];
  }

  formatearFechaCorta(fechaISO: string): string {
    const limpia = (fechaISO || '').split('T')[0];
    const partes = limpia.split('-');
    if (partes.length !== 3) return limpia;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  async enviarRegistro() {
    const todosLosEstudiantes = [...this.estudiantesSeleccionados, ...this.estudiantesInvitados];

    if (todosLosEstudiantes.length === 0) {
      this.mostrarAviso("Debes añadir al menos un estudiante.", 'advertencia');
      return;
    }

    if (!this.tutoriaPreCargada && !this.form.materia) {
      this.mostrarAviso("Debes seleccionar la Materia impartida.", 'advertencia');
      return;
    }

    const huboAsistenciaActual = this.huboAsistencia;

    // 🌟 PUNTO #7: Si NADIE asistió, registrar únicamente la inasistencia sin exigir tema, horas ni calificación
    if (!huboAsistenciaActual) {
      this.enviando = true;
      try {
        const promesas = [];
        const ahoraISO = new Date().toISOString();

        for (const est of todosLosEstudiantes) {
          const reporteInasistencia = {
            correoTutor: this.correoTutor,
            nombreTutor: this.nombreTutor,
            sede: this.sedeUsuario,
            periodo: this.dbService.periodo_actual,
            materia: this.form.materia,
            tema_tratado: 'Inasistencia registrada - El estudiante no asistió a la sesión.',
            horas: '0h 0m',
            horas_duracion: 0,
            minutos_duracion: 0,
            espacio_fisico: 'N/A',
            tipo_tutoria: this.form.tipo_tutoria || 'CONSULTA',
            estado_proceso: 'INASISTENCIA',
            motivo_cambio_tipo: 'Ninguno',
            asistio: 'NO',
            participo: 'NO',
            codigo_tutoria: this.form.codigo_tutoria || 'SIN CÓDIGO',
            estudiante_info: est.info,
            correo_estudiante: est.correo || '',
            nombre_docente: est.docente || 'No especificado',
            derivacion: est.derivacion || 'DECISIÓN PROPIA',
            fecha_agendamiento: this.fechaAgendamientoOriginal || ahoraISO,
            fecha_modificacion_tutor: this.fechaModificacionTutorOriginal || null,
            fecha_impartida: ahoraISO,
            fecha_registro: ahoraISO,
            calificacion_tutor: 0
          };
          promesas.push(this.dbService.guardarAsistencia(reporteInasistencia));

          if (est.idReserva) {
            promesas.push(deleteDoc(doc(this.firestore, 'Reservas', est.idReserva)));
          }
        }

        await Promise.all(promesas);
        this.mostrarAviso('Inasistencia registrada correctamente.', 'info');
        this.limpiarYRegresar();
      } catch (error) {
        this.mostrarAviso("Hubo un error al registrar la inasistencia. Revisa tu conexión a internet.", 'error');
      } finally {
        this.enviando = false;
      }
      return;
    }

    // =========================================================
    // FLUJO CUANDO HUBO ASISTENCIA (AL MENOS UN ESTUDIANTE = 'SI')
    // =========================================================
    const horasNum = Number(this.form.horas_duracion || 0);
    const minutosNum = Number(this.form.minutos_duracion || 0);

    // 🌟 PUNTO #3: Impedir registrar asistencia con 0h y 0 min
    if (horasNum <= 0 && minutosNum <= 0) {
      this.mostrarAviso("No puedes registrar una asistencia con 0 horas y 0 minutos.", 'advertencia');
      return;
    }

    if (!this.form.tema_tratado || this.form.tema_tratado.trim() === '') {
      this.mostrarAviso("Debes completar el Tema Impartido.", 'advertencia');
      return;
    }

    for (const est of todosLosEstudiantes) {
      if (est.asistio === 'SI' && (!est.docente || est.docente.trim() === '')) {
        this.mostrarAviso(`Por favor, indica el docente de la materia para ${est.nombre || 'el estudiante'}.`, 'advertencia');
        return;
      }
    }

    // Validaciones si es Tutoría de Proceso (Puntos #5, #8, #9, #10)
    let duracionNuevaProceso = 1;
    if (this.form.tipo_tutoria === 'PROCESO') {
      if (!this.accionProceso) {
        this.mostrarAviso("Por favor, selecciona si deseas Continuar Proceso o Finalizar Proceso.", 'advertencia');
        return;
      }

      if (this.accionProceso === 'CONTINUAR') {
        if (!this.sesionProcesoConfirmada || !this.fechaSiguienteProceso) {
          this.mostrarAviso("Configura y confirma la fecha y hora de la próxima sesión.", 'advertencia');
          this.seleccionarContinuarProceso();
          return;
        }
        const fechaLimpiaCheck = this.fechaSiguienteProceso.split('T')[0];
        if (this.fechaTutoriaOriginalISO && fechaLimpiaCheck <= this.fechaTutoriaOriginalISO) {
          this.mostrarAviso("La fecha de la siguiente sesión debe ser posterior a la tutoría original.", 'advertencia');
          this.seleccionarContinuarProceso();
          return;
        }
        const minIni = this.convertirHoraAMinutos(this.horaInicioProceso);
        const minFin = this.convertirHoraAMinutos(this.horaFinProceso);
        if (minFin <= minIni) {
          this.mostrarAviso("La hora de fin debe ser mayor a la hora de inicio.", 'advertencia');
          this.seleccionarContinuarProceso();
          return;
        }
        if (this.hayEstudiantesOtraSede) {
          this.modalidadSiguienteProceso = 'Virtual';
        }
        duracionNuevaProceso = Math.max(1, Math.round((minFin - minIni) / 60));
      }
    }

    if (this.form.calificacion_tutor === 0) {
      this.mostrarAviso("Por favor, califica tu experiencia general en esta sesión tutorial para poder registrar la asistencia.", 'error');
      return;
    }

    this.enviando = true;

    try {
      const promesas = [];
      const ahoraISO = new Date().toISOString();
      const tiempoFormateado = `${horasNum}h ${minutosNum}m`;
      const fechaLimpiaProceso = (this.fechaSiguienteProceso || '').split('T')[0];

      let estadoProcesoTexto = '';
      if (this.form.tipo_tutoria === 'PROCESO') {
        estadoProcesoTexto = this.accionProceso === 'CONTINUAR'
          ? `\nEstado Proceso: CONTINÚA (Próxima sesión: ${this.formatearFechaCorta(fechaLimpiaProceso)} ${this.horaInicioProceso}-${this.horaFinProceso})`
          : `\nEstado Proceso: FINALIZADO`;
      }
      
      const temaEnriquecido = `Tema: ${this.form.tema_tratado || 'No especificado'}
Tipo de Tutoría: ${this.form.tipo_tutoria || 'CONSULTA'}
Motivo (si cambió): ${this.form.motivo_cambio_tipo || 'Ninguno'}
Aula/Espacio: ${this.form.espacio_fisico || 'N/A'}${estadoProcesoTexto}`;

      const estudiantesAsistentes: any[] = [];

      for (const est of todosLosEstudiantes) {
        if (est.asistio === 'SI') {
          estudiantesAsistentes.push(est);

          const reporte = {
            correoTutor: this.correoTutor,
            nombreTutor: this.nombreTutor,
            sede: this.sedeUsuario,
            periodo: this.dbService.periodo_actual,
            materia: this.form.materia,
            tema_tratado: temaEnriquecido,
            horas: tiempoFormateado,
            horas_duracion: horasNum,
            minutos_duracion: minutosNum,
            espacio_fisico: this.form.espacio_fisico || 'N/A',   
            tipo_tutoria: this.form.tipo_tutoria,
            estado_proceso: this.form.tipo_tutoria === 'PROCESO' ? this.accionProceso : 'N/A',
            motivo_cambio_tipo: this.form.motivo_cambio_tipo || 'Ninguno',
            asistio: est.asistio, 
            participo: est.participo, 
            codigo_tutoria: this.form.codigo_tutoria || 'SIN CÓDIGO',
            estudiante_info: est.info,
            correo_estudiante: est.correo || '',
            nombre_docente: est.docente || 'No especificado', 
            derivacion: est.derivacion || 'DECISIÓN PROPIA',
            fecha_agendamiento: this.fechaAgendamientoOriginal || ahoraISO,
            fecha_modificacion_tutor: this.fechaModificacionTutorOriginal || null,
            fecha_impartida: ahoraISO,
            fecha_registro: ahoraISO,
            calificacion_tutor: this.form.calificacion_tutor
          };
          promesas.push(this.dbService.guardarAsistencia(reporte));

          if (est.correo) {
            const evalRef = doc(collection(this.firestore, 'EvaluacionesPendientes'));
            promesas.push(setDoc(evalRef, {
              correoEstudiante: est.correo,
              correoTutor: this.correoTutor,
              nombreTutor: this.nombreTutor,
              materia: this.form.materia,
              sede: this.sedeUsuario,
              codigo_tutoria: this.form.codigo_tutoria || 'SIN CÓDIGO',
              fecha_clase: ahoraISO,
              estado: 'PENDIENTE'
            }));
          }
        } else {
          // Registrar inasistencia individual del invitado/estudiante que faltó
          const reporteAusente = {
            correoTutor: this.correoTutor,
            nombreTutor: this.nombreTutor,
            sede: this.sedeUsuario,
            periodo: this.dbService.periodo_actual,
            materia: this.form.materia,
            tema_tratado: 'Inasistencia individual registrada en sesión grupal.',
            horas: '0h 0m',
            horas_duracion: 0,
            minutos_duracion: 0,
            espacio_fisico: this.form.espacio_fisico || 'N/A',
            tipo_tutoria: this.form.tipo_tutoria,
            estado_proceso: 'INASISTENCIA',
            motivo_cambio_tipo: 'Ninguno',
            asistio: 'NO',
            participo: 'NO',
            codigo_tutoria: this.form.codigo_tutoria || 'SIN CÓDIGO',
            estudiante_info: est.info,
            correo_estudiante: est.correo || '',
            nombre_docente: est.docente || 'No especificado',
            derivacion: est.derivacion || 'DECISIÓN PROPIA',
            fecha_agendamiento: this.fechaAgendamientoOriginal || ahoraISO,
            fecha_modificacion_tutor: this.fechaModificacionTutorOriginal || null,
            fecha_impartida: ahoraISO,
            fecha_registro: ahoraISO,
            calificacion_tutor: this.form.calificacion_tutor
          };
          promesas.push(this.dbService.guardarAsistencia(reporteAusente));
        }

        if (est.idReserva) {
          promesas.push(deleteDoc(doc(this.firestore, 'Reservas', est.idReserva)));
        }
      }

      // Continuación o finalización de Tutoría de Proceso (Puntos #5, #8, #9, #10, #11)
      if (this.form.tipo_tutoria === 'PROCESO' && estudiantesAsistentes.length > 0) {
        if (this.accionProceso === 'CONTINUAR') {
          const diaSiguiente = this.obtenerNombreDiaDesdeFecha(fechaLimpiaProceso);
          const horaSiguiente = `${this.horaInicioProceso} - ${this.horaFinProceso}`;
          const modalidadFinalProceso = this.hayEstudiantesOtraSede ? 'Virtual' : this.modalidadSiguienteProceso;
          const codigoProceso = this.form.codigo_tutoria || this.dbService.generarCodigoTutoria(this.form.materia);
          const celularTutorActual = localStorage.getItem('celular') || 'No registrado';
          const codigoPaisTutorActual = localStorage.getItem('codigo_pais') || '+593';

          estudiantesAsistentes.forEach((est, idx) => {
            if (!est.correo) return;
            promesas.push(addDoc(collection(this.firestore, 'Reservas'), {
              correoEstudiante: est.correo,
              nombreEstudiante: est.nombre,
              celularEstudiante: est.celular || 'No registrado',
              codigoPaisEstudiante: est.codigoPais || '+593',
              sedeEstudiante: est.sede || '',
              correoTutor: this.correoTutor,
              nombreTutor: this.nombreTutor,
              celularTutor: celularTutorActual,
              codigoPaisTutor: codigoPaisTutorActual,
              materia: this.form.materia,
              dia_elegido: diaSiguiente,
              hora_elegida: horaSiguiente,
              duracion_horas: duracionNuevaProceso,
              fecha_exacta: fechaLimpiaProceso,
              modalidad: modalidadFinalProceso,
              sedeTutor: this.sedeUsuario,
              codigo: codigoProceso,
              tipo_tutoria: 'PROCESO',
              tipo_flujo: 'PROCESO',
              tipo_derivacion: est.derivacion || 'DECISIÓN PROPIA',
              docente: est.docente || 'No especificado',
              estado: 'CONFIRMADA',
              esInvitado: idx > 0,
              es_invitado: idx > 0,
              fecha_solicitud: ahoraISO,
              fecha_agendamiento: ahoraISO,
              fecha_modificacion_tutor: null,
              fecha_impartida: null,
              periodo: this.dbService.periodo_actual
            }));

            if (this.dbService.crearNotificacion) {
              promesas.push(this.dbService.crearNotificacion({
                titulo: '📅 Siguiente Sesión de Proceso Agendada',
                mensaje: `Tu tutor ${this.nombreTutor} agendó la continuación de tu tutoría de proceso de ${this.form.materia} para el ${diaSiguiente} ${this.formatearFechaCorta(fechaLimpiaProceso)} de ${horaSiguiente} (${modalidadFinalProceso}). ¡Nos volvemos a ver ese día!`,
                tipo: 'TUTORIA',
                correo_destino: est.correo,
                sede_destino: 'GLOBAL',
                rol_destino: 'ESTUDIANTE'
              }));
            }
          });
        } else if (this.accionProceso === 'FINALIZAR' && this.dbService.crearNotificacion) {
          estudiantesAsistentes.forEach((est) => {
            if (!est.correo) return;
            promesas.push(this.dbService.crearNotificacion({
              titulo: '🎓 Tutoría de Proceso Finalizada',
              mensaje: `Tu tutor ${this.nombreTutor} ha dado por finalizado tu proceso de tutorías en ${this.form.materia}. ¡Éxitos en tus estudios!`,
              tipo: 'TUTORIA',
              correo_destino: est.correo,
              sede_destino: 'GLOBAL',
              rol_destino: 'ESTUDIANTE'
            }));
          });
        }
      }

      await Promise.all(promesas);

      if (this.form.tipo_tutoria === 'PROCESO' && this.accionProceso === 'CONTINUAR') {
        this.mostrarAviso(`Asistencia registrada y próxima sesión agendada para el ${this.formatearFechaCorta(fechaLimpiaProceso)}.`, 'exito');
      } else if (this.form.tipo_tutoria === 'PROCESO' && this.accionProceso === 'FINALIZAR') {
        this.mostrarAviso(`Asistencia registrada y Tutoría de Proceso finalizada con éxito.`, 'exito');
      } else {
        this.mostrarAviso(`Asistencia registrada. Tus alumnos deberán evaluarte.`, 'exito');
      }
      
      this.limpiarYRegresar();

    } catch (error) {
      this.mostrarAviso("Hubo un error al guardar. Revisa tu conexión a internet.", 'error');
    } finally {
      this.enviando = false;
    }
  }

  limpiarYRegresar() {
    this.form = { 
      materia: '', 
      tema_tratado: '', 
      horas_duracion: 1, 
      minutos_duracion: 0, 
      asistio: '', 
      participo: '', 
      codigo_tutoria: '', 
      calificacion_tutor: 0, 
      tipo_tutoria: 'CONSULTA', 
      motivo_cambio_tipo: '', 
      espacio_fisico: '', 
      duracion_ios: '01:00',
      modalidad: 'Presencial' 
    };
    
    this.accionProceso = '';
    this.sesionProcesoConfirmada = false;
    this.fechaSiguienteProceso = '';
    this.fechaAgendamientoOriginal = null;
    this.fechaModificacionTutorOriginal = null;
    this.estudiantesSeleccionados = [];
    this.estudiantesInvitados = []; 
    this.busquedaEstudiante = '';
    this.tutoriaPreCargada = false;

    this.tutorEstado.ocultarTabAsistencia();
    this.router.navigate(['/tabs-tutor/tutorias']);
  }

  async mostrarAviso(mensaje: string, tipo: 'exito' | 'error' | 'advertencia' | 'info' = 'exito') {
    let icono = 'checkmark-circle-outline';
    let claseCss = 'toast-exito';
    if (tipo === 'error') { icono = 'close-circle-outline'; claseCss = 'toast-error'; } 
    else if (tipo === 'advertencia') { icono = 'warning-outline'; claseCss = 'toast-advertencia'; } 
    else if (tipo === 'info') { icono = 'information-circle-outline'; claseCss = 'toast-info'; }

    const toast = await this.toastController.create({
      message: mensaje, duration: 4000, position: 'top', icon: icono, cssClass: `toast-premium-gietaes ${claseCss}`, mode: 'ios' 
    });
    await toast.present();
  }

  async solicitarCambioTipoTutoria() {
    const alertTipo = await this.alertController.create({
      header: 'Cambiar Tipo de Tutoría',
      message: 'Paso 1: Selecciona el nuevo tipo de tutoría:',
      cssClass: 'alerta-premium-gietaes',
      mode: 'md',
      inputs: [
        { name: 'nuevoTipo', type: 'radio', label: 'Tutoría de Consulta', value: 'CONSULTA', checked: this.form.tipo_tutoria === 'CONSULTA' },
        { name: 'nuevoTipo', type: 'radio', label: 'Tutoría de Proceso', value: 'PROCESO', checked: this.form.tipo_tutoria === 'PROCESO' },
        { name: 'nuevoTipo', type: 'radio', label: 'Tutoría Práctica', value: 'PRÁCTICA', checked: this.form.tipo_tutoria === 'PRÁCTICA' || this.form.tipo_tutoria === 'PRACTICA' },
        { name: 'nuevoTipo', type: 'radio', label: 'Tutoría Intensiva', value: 'INTENSIVA', checked: this.form.tipo_tutoria === 'INTENSIVA' }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Siguiente',
          handler: (nuevoTipoSeleccionado) => {
            if (!nuevoTipoSeleccionado) {
              this.mostrarAviso('Debes seleccionar un tipo de tutoría.', 'advertencia');
              return false;
            }
            this.pedirMotivoCambioTipo(nuevoTipoSeleccionado);
            return true;
          }
        }
      ]
    });
    await alertTipo.present();
  }

  async pedirMotivoCambioTipo(nuevoTipo: string) {
    const alertMotivo = await this.alertController.create({
      header: 'Motivo del Cambio',
      message: `Paso 2: Indica por qué cambias a ${nuevoTipo}:`,
      cssClass: 'alerta-premium-gietaes',
      mode: 'md',
      inputs: [
        {
          name: 'motivo',
          type: 'textarea',
          placeholder: 'Ej: El tema requiere seguimiento por sesiones...'
        }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: (data) => {
            if (!data.motivo || data.motivo.trim() === '') {
              this.mostrarAviso('Debes escribir el motivo del cambio.', 'advertencia');
              return false;
            }
            this.form.tipo_tutoria = nuevoTipo;
            this.form.motivo_cambio_tipo = data.motivo.trim();
            if (nuevoTipo !== 'PROCESO') {
              this.accionProceso = '';
              this.sesionProcesoConfirmada = false;
              this.fechaSiguienteProceso = '';
            }
            this.mostrarAviso(`Tipo actualizado a ${nuevoTipo}.`, 'exito');
            return true;
          }
        }
      ]
    });
    await alertMotivo.present();
  }
}