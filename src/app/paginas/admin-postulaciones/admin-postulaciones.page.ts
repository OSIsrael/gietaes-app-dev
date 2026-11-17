import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { Firestore, collection, query, where, getDocs, addDoc, doc, deleteDoc, updateDoc } from '@angular/fire/firestore';
import { DatabaseService } from '../../services/database';
import { CommonModule, KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, signOut } from '@angular/fire/auth';
import {
  IonContent, IonHeader, IonToolbar, IonButton, IonButtons, IonIcon,
  IonInput, IonTextarea, IonSelect, IonSelectOption,
  IonDatetime, IonDatetimeButton, IonModal, ToastController, AlertController, IonLabel, IonList, IonItem, IonSpinner, IonPopover 
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  arrowBackOutline, megaphoneOutline, checkmarkCircleOutline, closeCircleOutline, 
  personOutline, timeOutline, bookOutline, personCircleOutline, documentTextOutline, 
  filterOutline, locationOutline, callOutline, mailOutline, closeOutline, 
  checkmarkOutline, chevronDownOutline, chevronUpOutline, warning, calendarOutline, 
  logoWhatsapp, buildOutline, sadOutline, shieldCheckmarkOutline, briefcaseOutline, 
  schoolOutline, settingsOutline, logOutOutline, notificationsOutline, peopleOutline, createOutline,
  lockClosedOutline, searchOutline
} from 'ionicons/icons';

@Component({
  selector: 'app-admin-postulaciones',
  templateUrl: './admin-postulaciones.page.html',
  styleUrls: ['./admin.postulaciones.page.scss'], 
  standalone: true,
  imports: [
    CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, IonButton,
    KeyValuePipe, IonButtons, IonIcon, IonInput,
    IonTextarea, IonSelect, IonSelectOption,
    IonDatetime, IonDatetimeButton, IonModal, IonList, IonLabel, IonItem, IonSpinner, IonPopover
  ],
})
export class AdminPostulacionesPage {
  private firestore = inject(Firestore);
  private dbService = inject(DatabaseService);
  private router = inject(Router);
  private auth = inject(Auth);
  private cdr = inject(ChangeDetectorRef);

  private toastController = inject(ToastController);
  private alertController = inject(AlertController);

  postulacionesAgrupadas: any[] = [];
  
  sedeAdmin: string = ''; 

  // FILTROS DE BANDEJA (SEDE + PERÍODO + CARRERA)
  filtroSedePostulaciones: string = 'GLOBAL';
  filtroPeriodoPostulaciones: string = 'TODOS';
  filtroCarreraPostulaciones: string = 'TODAS';

  // 🌟 PUNTOS #11 Y #14: CONTROL DE TUTORÍAS SOLICITADAS (SEDE + ESTADO + BÚSQUEDA)
  todasLasReservasControl: any[] = [];
  reservasControlFiltradas: any[] = [];
  filtroSedeReservas: string = 'GLOBAL';
  filtroEstadoReservas: string = 'TODOS';
  busquedaReservas: string = '';
  conteoReservasPorEstado = {
    total: 0,
    pendientes: 0,
    confirmadas: 0,
    canceladas: 0
  };

  // 🌟 PUNTOS #15 Y #16: FILTROS DE MÉTRICAS NUMÉRICAS Y TABLAS DETALLADAS
  filtroSedeGraficas: string = 'GLOBAL';
  filtroPeriodoMetricas: string = 'TODOS';
  filtroCarreraMetricas: string = 'TODAS';

  listaPeriodos: string[] = [];
  listaCarreras: string[] = [];

  metricasAdmin = {
    totalTutores: 0,
    tutoresActivos: 0,
    porcentajeActivos: 0,
    tutoriasImpartidas: 0,
    horasImpartidas: 0,
    estudiantesUnicos: 0,
    postulacionesPendientes: 0
  };
  desglosePorCarrera: { carrera: string; tutoresActivos: number; tutoriasImpartidas: number }[] = [];

  // 🌟 PUNTO #15: TABLAS DETALLADAS DE TUTORES Y ESTUDIANTES
  tablaTutoresMaster: any[] = [];
  tablaTutoresFiltrada: any[] = [];
  busquedaTablaTutores: string = '';

  tablaEstudiantesMaster: any[] = [];
  tablaEstudiantesFiltrada: any[] = [];
  busquedaTablaEstudiantes: string = '';
  
  tutoriasEnAlerta: any[] = [];
  mostrarModalReasignacion: boolean = false;
  cargandoTutores: boolean = false;
  tutoriaAReasignar: any = null;
  tutoresSugeridos: any[] = [];

  rolUsuario: string = '';
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

  enviandoAnuncio: boolean = false;

  nuevoAnuncio = {
    titulo: '',
    descripcion: '',
    fecha_evento: new Date().toISOString(),
    sede_destino: 'GLOBAL',
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

  mostrarModalEditarHorario: boolean = false;
  estudianteEditando: any = null;
  horarioTemporalAdmin: any = {};
  modalidadGlobalAdmin: string = 'PRESENCIAL';
  diassemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  franjasHorarias = ['07:00 - 09:00', '09:00 - 11:00', '11:00 - 13:00', '14:00 - 16:00', '16:00 - 18:00', '18:00 - 20:00', '20:00 - 22:00'];

  // 🌟 PUNTO #4: Detectar franjas de sábado bloqueadas (>= 13:00)
  esBloqueSabadoBloqueado(dia: string, franja: string): boolean {
    const diaNorm = String(dia || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (diaNorm !== 'sabado') return false;

    const horaInicioStr = String(franja || '').split('-')[0]?.trim() || '00:00';
    const [hStr, mStr] = horaInicioStr.split(':');
    const minutosInicio = (parseInt(hStr || '0', 10) * 60) + parseInt(mStr || '0', 10);
    return minutosInicio >= 13 * 60;
  }

  // 🌟 PUNTO #4: Sanitizar mapa de horarios (eliminar sábados >= 13:00 y forzar VIRTUAL en sábados < 13:00)
  sanitizarHorarioAdmin(horariosRaw: any): { [key: string]: string } {
    const limpio: { [key: string]: string } = {};
    if (!horariosRaw || typeof horariosRaw !== 'object') return limpio;

    Object.keys(horariosRaw).forEach(clave => {
      const dashIdx = clave.indexOf('-');
      if (dashIdx === -1) {
        limpio[clave] = horariosRaw[clave];
        return;
      }
      const dia = clave.substring(0, dashIdx).trim();
      const franja = clave.substring(dashIdx + 1).trim();
      const diaNorm = dia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      if (this.esBloqueSabadoBloqueado(dia, franja)) {
        return; // Bloqueado: no se incluye
      }

      if (diaNorm === 'sabado') {
        limpio[clave] = 'VIRTUAL'; // Forzar modalidad Virtual los sábados
      } else {
        limpio[clave] = horariosRaw[clave];
      }
    });

    return limpio;
  }

  abrirModalEditarHorario(estudiante: any) {
    this.estudianteEditando = estudiante;
    this.horarioTemporalAdmin = this.sanitizarHorarioAdmin(estudiante.horarios || {});
    this.mostrarModalEditarHorario = true;
  }

  seleccionarModalidadGlobalAdmin(mod: string) {
    this.modalidadGlobalAdmin = mod;
  }

  seleccionarBloqueAdmin(dia: string, franja: string) {
    // 🌟 PUNTO #4: Bloquear sábados desde las 13:00
    if (this.esBloqueSabadoBloqueado(dia, franja)) {
      this.mostrarAviso('Los sábados están bloqueados a partir de las 13:00.', 'advertencia');
      return;
    }

    const clave = `${dia}-${franja}`;
    if (this.horarioTemporalAdmin[clave]) {
      delete this.horarioTemporalAdmin[clave];
    } else {
      const diaNorm = dia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      // 🌟 PUNTO #4: Forzar modalidad VIRTUAL en sábado
      this.horarioTemporalAdmin[clave] = diaNorm === 'sabado' ? 'VIRTUAL' : this.modalidadGlobalAdmin;
    }
  }

  guardarHorarioEditado() {
    const horarioSanitizado = this.sanitizarHorarioAdmin(this.horarioTemporalAdmin);
    if (this.estudianteEditando) {
      this.estudianteEditando.horarios = { ...horarioSanitizado };
      this.estudianteEditando.materias_postuladas.forEach((postulacion: any) => {
        postulacion.horarios = { ...horarioSanitizado };
        postulacion.disponibilidad_horaria = { ...horarioSanitizado };
      });
    }
    this.mostrarModalEditarHorario = false;
    this.mostrarAviso('Horario ajustado. Presiona ACEPTAR en una materia para confirmar y guardarlo en la base de datos.', 'info');
  }

  constructor() {
    addIcons({
      arrowBackOutline, personCircleOutline, filterOutline, checkmarkCircleOutline, 
      personOutline, locationOutline, callOutline, mailOutline, documentTextOutline, 
      timeOutline, bookOutline, closeOutline, checkmarkOutline, chevronDownOutline, 
      chevronUpOutline, warning, calendarOutline, logoWhatsapp, buildOutline, 
      sadOutline, megaphoneOutline, closeCircleOutline, shieldCheckmarkOutline, 
      briefcaseOutline, schoolOutline, settingsOutline, logOutOutline, 
      notificationsOutline, peopleOutline, createOutline, lockClosedOutline, searchOutline
    });
  }

  async ionViewWillEnter() {
    this.correoUsuario = localStorage.getItem('correo') || '';
    this.nombreUsuario = localStorage.getItem('nombre') || '';
    this.rolUsuario = String(localStorage.getItem('rol') || 'ESTUDIANTE').toUpperCase(); 
    this.sedeUsuario = String(localStorage.getItem('sede') || 'CUENCA').toUpperCase();
    this.sedeAdmin = this.sedeUsuario;

    if (this.rolUsuario === 'COORDINADOR') {
      this.filtroSedePostulaciones = this.sedeUsuario;
      this.filtroSedeGraficas = this.sedeUsuario;
      this.filtroSedeReservas = this.sedeUsuario;
      this.nuevoAnuncio.sede_destino = this.sedeUsuario;
    }

    if (this.rolUsuario !== 'ADMIN' && this.rolUsuario !== 'COORDINADOR') {
      this.router.navigate(['/login']);
      return;
    }

    await this.dbService.cargarConfiguracionGlobal(true);
    if (this.dbService.periodo_actual) {
      this.filtroPeriodoMetricas = this.dbService.periodo_actual;
    }

    await this.cargarPermisosPaneles(this.correoUsuario);
    await this.verificarNotificaciones(this.correoUsuario, this.rolUsuario, this.sedeUsuario);

    await this.cargarOpcionesFiltros();
    await this.cargarPostulaciones();
    await this.cargarControlTutoriasSolicitadas();
    await this.cargarEstadisticas();
    this.limpiarAnunciosExpirados();
    this.cargarTutoriasEnAlerta();
  }

  // CARGA DINÁMICA DE PERÍODOS Y CARRERAS DISPONIBLES
  async cargarOpcionesFiltros() {
    const periodosSet = new Set<string>();
    const carrerasSet = new Set<string>();

    if (this.dbService.periodo_actual) {
      periodosSet.add(String(this.dbService.periodo_actual).trim());
    }

    try {
      const [snapTutores, snapEstudiantes, snapAsistencias, snapPostulaciones] = await Promise.all([
        getDocs(collection(this.firestore, 'Tutores')),
        getDocs(collection(this.firestore, 'Estudiantes')),
        getDocs(collection(this.firestore, 'Asistencias')),
        getDocs(collection(this.firestore, 'Postulaciones'))
      ]);

      snapTutores.forEach(d => {
        const data = d.data();
        if (data['carrera']) carrerasSet.add(String(data['carrera']).trim().toUpperCase());
        if (data['ultimo_periodo_activo']) periodosSet.add(String(data['ultimo_periodo_activo']).trim());
        if (data['periodo']) periodosSet.add(String(data['periodo']).trim());
      });

      snapEstudiantes.forEach(d => {
        const data = d.data();
        if (data['carrera']) carrerasSet.add(String(data['carrera']).trim().toUpperCase());
        if (data['ultimo_periodo_activo']) periodosSet.add(String(data['ultimo_periodo_activo']).trim());
        if (data['periodo']) periodosSet.add(String(data['periodo']).trim());
      });

      snapAsistencias.forEach(d => {
        const data = d.data();
        if (data['periodo']) periodosSet.add(String(data['periodo']).trim());
      });

      snapPostulaciones.forEach(d => {
        const data = d.data();
        if (data['carrera']) carrerasSet.add(String(data['carrera']).trim().toUpperCase());
        if (data['periodo']) periodosSet.add(String(data['periodo']).trim());
      });

      this.listaPeriodos = Array.from(periodosSet).filter(Boolean).sort().reverse();
      this.listaCarreras = Array.from(carrerasSet).filter(Boolean).sort();
    } catch (e) {
      console.error('Error cargando opciones de filtros:', e);
    }
  }

  async cargarPermisosPaneles(correo: string) {
    this.tienePanelTutor = false;
    this.tienePanelAdmin = false;
    if (!correo) return;
    try {
      const permisos = await this.dbService.obtenerPermisosPaneles(correo);
      this.tienePanelTutor = permisos.tienePanelTutor;
      this.tienePanelAdmin = permisos.tienePanelAdmin;
    } catch (error) { console.error("Error permisos:", error); }
    if (this.cdr) this.cdr.detectChanges(); 
  }

  abrirMenuRol(evento: any) { this.eventoRol = evento; this.menuRolAbierto = true; }
  abrirMenuPerfil(evento: any) { this.eventoPerfil = evento; this.menuPerfilAbierto = true; }

  irAPanel(ruta: string, rolDestino: string) {
    this.menuRolAbierto = false; 
    localStorage.setItem('rol', rolDestino); 
    setTimeout(() => { this.router.navigate([ruta]); }, 150); 
  }

  irAPerfil() {
    this.menuPerfilAbierto = false;
    this.router.navigate(['/tabs/perfil']); 
  }

  async cerrarSesion() {
    this.menuPerfilAbierto = false;
    try {
      await signOut(this.auth);
      localStorage.clear();
      this.router.navigate(['/login']);
    } catch (error) {
      localStorage.clear();
      this.router.navigate(['/login']);
    }
  }

  async verificarNotificaciones(correo: string, rol: string, sede: string) {
    try {
      const notifs = await this.dbService.obtenerNotificacionesUsuario(correo, rol, sede, 'COORDINADOR');
      const sinLeer = notifs.filter((n: any) => !n['leida_por']?.includes(correo));
      this.hayNotificacionesSinLeer = sinLeer.length > 0;
    } catch (error) {}
  }

  irANotificaciones() {
    this.router.navigate(['/notificaciones'], { queryParams: { panel: 'COORDINADOR' } });
  }

  // =====================================================================
  // 🌟 PUNTOS #11 Y #14: CONTROL DE TUTORÍAS SOLICITADAS (SEDE Y ESTADO)
  // =====================================================================
  async cargarControlTutoriasSolicitadas() {
    try {
      const snapReservas = await getDocs(collection(this.firestore, 'Reservas'));
      this.todasLasReservasControl = snapReservas.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          ...data,
          estado: String(data['estado'] || 'PENDIENTE').toUpperCase().trim()
        };
      });

      // Ordenar por fecha_exacta descendente (más recientes primero)
      this.todasLasReservasControl.sort((a, b) => {
        const fA = String(a.fecha_exacta || a.fecha_solicitud || '');
        const fB = String(b.fecha_exacta || b.fecha_solicitud || '');
        return fB.localeCompare(fA);
      });

      this.aplicarFiltrosReservas();
    } catch (error) {
      console.error('Error cargando control de tutorías solicitadas:', error);
    }
  }

  aplicarFiltrosReservas() {
    const esSuperAdmin = this.rolUsuario === 'ADMIN';
    const sedeObjetivo = esSuperAdmin ? this.filtroSedeReservas : this.sedeUsuario;
    const estadoObjetivo = String(this.filtroEstadoReservas || 'TODOS').toUpperCase().trim();
    const textoBusq = String(this.busquedaReservas || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    // 1. Filtrar primero por Sede para calcular los conteos reales por estado de esa Sede
    const reservasDeSede = this.todasLasReservasControl.filter(res => {
      const sedeTutor = String(res.sedeTutor || res.sede || '').toUpperCase().trim();
      const sedeEst = String(res.sedeEstudiante || '').toUpperCase().trim();

      if (!esSuperAdmin) {
        return sedeTutor === this.sedeUsuario || sedeEst === this.sedeUsuario;
      }
      if (sedeObjetivo === 'GLOBAL') return true;
      return sedeTutor === sedeObjetivo || sedeEst === sedeObjetivo;
    });

    this.conteoReservasPorEstado = {
      total: reservasDeSede.length,
      pendientes: reservasDeSede.filter(r => r.estado === 'PENDIENTE').length,
      confirmadas: reservasDeSede.filter(r => r.estado === 'CONFIRMADA').length,
      canceladas: reservasDeSede.filter(r => r.estado === 'CANCELADA' || r.estado === 'RECHAZADA' || r.estado === 'REQUIERE_ADMIN').length
    };

    // 2. Filtrar por Estado y búsqueda textual
    this.reservasControlFiltradas = reservasDeSede.filter(res => {
      if (estadoObjetivo !== 'TODOS' && res.estado !== estadoObjetivo) {
        return false;
      }
      if (textoBusq) {
        const bloqueTexto = `${res.materia || ''} ${res.nombreTutor || ''} ${res.nombreEstudiante || ''} ${res.codigo || ''} ${res.docente || ''}`
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        if (!bloqueTexto.includes(textoBusq)) return false;
      }
      return true;
    });

    if (this.cdr) this.cdr.detectChanges();
  }

  contactarPorWhatsAppControl(celular: string, nombreDestino: string, materia: string, rolDestino: 'ESTUDIANTE' | 'TUTOR') {
    if (!celular) return;
    let limpio = String(celular).replace(/\D/g, '');
    if (limpio.startsWith('0')) limpio = '593' + limpio.substring(1);
    if (!limpio.startsWith('593') && limpio.length === 9) limpio = '593' + limpio;

    const texto = rolDestino === 'ESTUDIANTE'
      ? `Hola ${nombreDestino}, te saludamos desde Coordinación GIETAES respecto a tu tutoría solicitada de ${materia}.`
      : `Hola ${nombreDestino}, te saludamos desde Coordinación GIETAES respecto a la tutoría de ${materia} asignada en tu agenda.`;

    window.open(`https://wa.me/${limpio}?text=${encodeURIComponent(texto)}`, '_blank');
  }

  // ==========================================
  // ALERTAS SOS
  // ==========================================
  async cargarTutoriasEnAlerta() {
    try {
      const q = query(collection(this.firestore, 'Reservas'), where('estado', '==', 'REQUIERE_ADMIN'));
      const snapshot = await getDocs(q);
      
      this.tutoriasEnAlerta = [];
      const esSuperAdmin = this.rolUsuario === 'ADMIN';
      
      snapshot.forEach(documento => {
        const data = documento.data();
        const sedeReserva = String(data['sede'] || data['sedeTutor'] || data['sedeEstudiante'] || '').toUpperCase();
        const cumpleSede = esSuperAdmin || sedeReserva === this.sedeUsuario;

        if (cumpleSede) {
          this.tutoriasEnAlerta.push({ id: documento.id, ...data });
        }
      });
    } catch (error) {
      console.error("Error al cargar alertas:", error);
    }
  }

  async asignarNuevoTutorManual(tutor: any) {
    if (!this.tutoriaAReasignar) return;

    try {
      await updateDoc(doc(this.firestore, 'Reservas', this.tutoriaAReasignar.id), {
        estado: 'PENDIENTE',
        nombreTutor: tutor.nombre.toUpperCase(),
        correoTutor: tutor.correo.toLowerCase(),
        celularTutor: tutor.celular || 'No registrado',
        notas_admin: 'Rescatado y reasignado por Coordinación.'
      });
      
      try {
        if (this.dbService.crearNotificacion) {
          await this.dbService.crearNotificacion({
            titulo: '🚨 Nueva Tutoría Asignada',
            mensaje: `Coordinación te ha asignado una tutoría urgente de ${this.tutoriaAReasignar.materia}. Revisa tu panel para confirmarla.`,
            tipo: 'TUTORIA',
            correo_destino: tutor.correo.toLowerCase(),
            sede_destino: tutor.sede || 'CUENCA',
            rol_destino: 'TUTOR' 
          });
        }
      } catch (notiError) {}

      this.mostrarAviso(`Tutoría reasignada exitosamente a ${tutor.nombre}.`, 'exito');
      this.mostrarModalReasignacion = false;
      this.cargarTutoriasEnAlerta(); 
      await this.cargarControlTutoriasSolicitadas();
    } catch (error) {
      this.mostrarAviso('Error al intentar reasignar la tutoría.', 'error');
    }
  }

  async eliminarTutoriaHuerfana() {
    const confirmar = await this.confirmarAccion('¿Dar de baja definitivamente?', 'El estudiante se quedará sin tutoría y esta alerta desaparecerá.');
    if (!confirmar || !this.tutoriaAReasignar) return;

    try {
      await deleteDoc(doc(this.firestore, 'Reservas', this.tutoriaAReasignar.id));
      this.mostrarAviso('Solicitud eliminada.', 'info');
      this.mostrarModalReasignacion = false;
      this.cargarTutoriasEnAlerta();
      await this.cargarControlTutoriasSolicitadas();
    } catch (error) {
      this.mostrarAviso('Error al eliminar.', 'error');
    }
  }

  contactarEstudianteAlerta(celular: string, nombre: string) {
    if (!celular) return;
    let celFormateado = celular.replace(/\D/g, ''); 
    if (celFormateado.startsWith('0')) celFormateado = '593' + celFormateado.substring(1);
    const mensaje = encodeURIComponent(`Hola ${nombre}, te escribimos de Coordinación de Tutorías. Hubo un inconveniente con el tutor asignado, pero ya te estamos buscando un reemplazo para tu tutoría.`);
    window.open(`https://wa.me/${celFormateado}?text=${mensaje}`, '_blank');
  }

  async cargarPostulaciones() {
    try {
      let q;
      const esSuperAdmin = this.rolUsuario === 'ADMIN';

      if (this.filtroSedePostulaciones === 'GLOBAL' && esSuperAdmin) {
        q = query(collection(this.firestore, 'Postulaciones'), where('estado_aprobacion', '==', 'PENDIENTE'));
      } else {
        q = query(
          collection(this.firestore, 'Postulaciones'),
          where('estado_aprobacion', '==', 'PENDIENTE'),
          where('sede', '==', this.filtroSedePostulaciones)
        );
      }
      
      const snapshot = await getDocs(q);
      const rawPostulaciones = snapshot.docs.map((doc) => {
        const data = doc.data() as any; 
        return { id: doc.id, ...data };
      });

      const diccionarioEstudiantes: { [correo: string]: any } = {};

      rawPostulaciones.forEach((post: any) => {
        const correo = post['correo'];
        const sedePost = String(post['sede'] || '').toUpperCase();
        const carreraPost = String(post['carrera'] || '').trim().toUpperCase();
        const periodoPost = String(post['periodo'] || this.dbService.periodo_actual || '').trim();
        
        if (!esSuperAdmin && sedePost !== this.sedeUsuario) return;
        if (this.filtroCarreraPostulaciones !== 'TODAS' && carreraPost !== this.filtroCarreraPostulaciones) return;
        if (this.filtroPeriodoPostulaciones !== 'TODOS' && periodoPost !== this.filtroPeriodoPostulaciones) return;

        if (!diccionarioEstudiantes[correo]) {
          diccionarioEstudiantes[correo] = {
            nombre: post['nombre'],
            correo: post['correo'],
            cedula: post['cedula'],
            sede: post['sede'],
            carrera: post['carrera'],
            ciclo: post['ciclo'],
            celular: post['celular'],
            permanencia: post['permanencia'],
            horarios: this.sanitizarHorarioAdmin(post['disponibilidad_horaria'] || {}), 
            url_documento: post['url_documento_rendimiento'] || null, 
            expandido: false,
            materias_postuladas: [] 
          };
        }
        diccionarioEstudiantes[correo].materias_postuladas.push(post);
      });

      this.postulacionesAgrupadas = Object.values(diccionarioEstudiantes);
    } catch (error) {
      console.error('Error cargando postulaciones:', error);
    }
  }

  async abrirModalReasignacion(tutoria: any) {
    this.tutoriaAReasignar = tutoria;
    this.mostrarModalReasignacion = true;
    this.cargandoTutores = true;
    this.tutoresSugeridos = [];

    try {
      const q = query(collection(this.firestore, 'Tutores'), where('estado', '==', 'ACTIVO'));
      const snap = await getDocs(q);

      const horario = tutoria.horas || tutoria.hora_elegida || '';
      const esPresencial = horario.includes('(P)') || horario.includes('(A)');

      let candidatos: any[] = [];

      snap.forEach(doc => {
        const tutor = doc.data();
        const dictaMateria = tutor['materias'] && tutor['materias'].includes(tutoria.materia);

        if (dictaMateria) {
          let cumpleSede = true;
          if (esPresencial) {
            const sedeTutor = String(tutor['sede'] || '').toUpperCase();
            const sedeTutoria = String(tutoria.sede || tutoria.sedeEstudiante || this.sedeAdmin).toUpperCase();
            cumpleSede = sedeTutor === sedeTutoria;
          }

          if (cumpleSede) {
            candidatos.push({
              id: doc.id,
              nombre: tutor['nombre'],
              correo: tutor['correo'] || tutor['correo_google'],
              celular: tutor['celular'],
              sede: tutor['sede']
            });
          }
        }
      });

      this.tutoresSugeridos = candidatos;
    } catch (error) {
      console.error('Error buscando tutores de reemplazo:', error);
    }
    this.cargandoTutores = false;
  }

  verDocumento(url: string) {
    if (!url) {
      this.mostrarAviso('El estudiante no adjuntó un documento válido.', 'advertencia');
      return;
    }
    window.open(url, '_blank');
  }

  async aceptar(post: any) {
    const confirmar = await this.confirmarAccion(`¿Estás seguro de APROBAR a ${post.nombre} para dictar ${post.materia_postulada}?`, '');
    if (!confirmar) return; 

    try {
      await this.dbService.aceptarTutor(post.id, post);
      
      try {
        const qTutor = query(collection(this.firestore, 'Tutores'), where('correo', '==', post.correo));
        const snapTutor = await getDocs(qTutor);
        
        if (!snapTutor.empty) {
          const tutorId = snapTutor.docs[0].id;
          // 🌟 PUNTO #4: Asegurar que el horario guardado respete bloqueo sábado >= 13:00 y Virtual
          const horariosPropuestos = this.sanitizarHorarioAdmin(post.horarios || post.disponibilidad_horaria || {});
          
          if (Object.keys(horariosPropuestos).length > 0) {
            await updateDoc(doc(this.firestore, 'Tutores', tutorId), {
              horarios: horariosPropuestos,
              estado_horario: 'APROBADO'
            });
          }
        }
      } catch (errorHorarios) {}
      
      try {
        await this.dbService.crearNotificacion({
          titulo: '¡Postulación Aprobada! 🎉',
          mensaje: `¡Felicidades! Tu solicitud para impartir "${post.materia_postulada}" ha sido aceptada. Tu horario propuesto ya está activo.`,
          tipo: 'POSTULACION',
          correo_destino: post.correo, 
          sede_destino: post.sede,
          rol_destino: 'ESTUDIANTE' 
        });
      } catch (e) {}

      this.mostrarAviso(`Tutor aceptado en ${post.materia_postulada}`, 'info');
      await this.cargarPostulaciones(); 
      await this.cargarEstadisticas();
    } catch (e) { 
      this.mostrarAviso('Error al aceptar tutor', 'error'); 
    }
  }

  async rechazar(post: any) {
    const confirmar = await this.confirmarAccion(`¿Estás seguro de RECHAZAR a ${post.nombre} para dictar ${post.materia_postulada}?`, '');
    if (!confirmar) return;

    try {
      await this.dbService.rechazarPostulacion(post.id);
      
      try {
        await this.dbService.crearNotificacion({
          titulo: 'Postulación Rechazada ❌',
          mensaje: `Tu solicitud para ser tutor de "${post.materia_postulada}" no pudo ser aprobada en esta ocasión. Sigue esforzándote.`,
          tipo: 'POSTULACION',
          correo_destino: post.correo,
          sede_destino: post.sede,
          rol_destino: 'ESTUDIANTE' 
        });
      } catch (e) {}

      this.mostrarAviso(`Postulación para ${post.materia_postulada} rechazada.`, 'info');
      await this.cargarPostulaciones(); 
      await this.cargarEstadisticas();
    } catch (error) {
      this.mostrarAviso('Error al rechazar la postulación.', 'error');
    }
  }

  obtenerDia(clave: any): string { return String(clave).split('-')[0] || ''; }
  obtenerHora(clave: any): string { return String(clave).split('-')[1] || ''; }

  regresar() { 
    this.router.navigate(['/tabs/perfil']); 
  }

  // ==========================================================================
  // 🌟 PUNTOS #15 y #16: INDICADORES + TABLA DE TUTORES Y TABLA DE ESTUDIANTES
  // ==========================================================================
  async cargarEstadisticas() {
    try {
      const [queryTutores, queryEstudiantes, queryAsistencias, queryPostulaciones, queryReservas] = await Promise.all([
        getDocs(collection(this.firestore, 'Tutores')),
        getDocs(collection(this.firestore, 'Estudiantes')),
        getDocs(collection(this.firestore, 'Asistencias')),
        getDocs(query(collection(this.firestore, 'Postulaciones'), where('estado_aprobacion', '==', 'PENDIENTE'))),
        getDocs(collection(this.firestore, 'Reservas'))
      ]);

      const esSuperAdmin = this.rolUsuario === 'ADMIN';
      const mapaTutorInfo: { [correo: string]: { carrera: string; sede: string } } = {};
      const resumenCarreras: { [carrera: string]: { tutoresActivos: number; tutoriasImpartidas: number } } = {};

      // Estructuras para Tablas Detalladas (Punto #15)
      const mapaTutoresDetalle: { [correo: string]: any } = {};
      const mapaEstudiantesDetalle: { [claveEst: string]: any } = {};
      const mapaEstudiantesPorCorreo: { [correo: string]: any } = {};
      const mapaEstudiantesPorNombre: { [nombreNorm: string]: any } = {};

      let totalTutores = 0;
      let tutoresActivos = 0;

      // 1. Procesar Tutores
      queryTutores.forEach((docSnap) => {
        const data = docSnap.data();
        const sedeTutor = String(data['sede'] || '').toUpperCase().trim();
        const estadoTutor = String(data['estado'] || 'INACTIVO').toUpperCase().trim();
        const correoTutor = String(data['correo'] || data['correo_google'] || '').toLowerCase().trim();
        const nombreTutor = String(data['nombre'] || 'Sin Nombre').trim();
        const carrera = String(data['carrera'] || 'NO ASIGNADA').trim().toUpperCase();
        const periodoTutor = String(data['ultimo_periodo_activo'] || data['periodo'] || '').trim();

        const tienePermisoSede = esSuperAdmin || sedeTutor === this.sedeUsuario;
        const cumpleSede = tienePermisoSede && (this.filtroSedeGraficas === 'GLOBAL' || sedeTutor === this.filtroSedeGraficas);
        if (!cumpleSede) return;

        mapaTutorInfo[correoTutor] = { carrera, sede: sedeTutor };

        const cumpleCarrera = this.filtroCarreraMetricas === 'TODAS' || carrera === this.filtroCarreraMetricas;
        const cumplePeriodoTutor = this.filtroPeriodoMetricas === 'TODOS' || !periodoTutor || periodoTutor === this.filtroPeriodoMetricas;

        if (cumpleCarrera && cumplePeriodoTutor) {
          totalTutores++;
          if (estadoTutor === 'ACTIVO') {
            tutoresActivos++;
            if (!resumenCarreras[carrera]) {
              resumenCarreras[carrera] = { tutoresActivos: 0, tutoriasImpartidas: 0 };
            }
            resumenCarreras[carrera].tutoresActivos++;
          }

          let materiasArr: string[] = [];
          if (Array.isArray(data['materias'])) {
            materiasArr = data['materias'].map((m: string) => String(m).toUpperCase().trim()).filter(Boolean);
          } else if (typeof data['materias'] === 'string') {
            materiasArr = data['materias'].split(',').map((m: string) => m.trim().toUpperCase()).filter(Boolean);
          }

          mapaTutoresDetalle[correoTutor || docSnap.id] = {
            correo: correoTutor,
            nombre: nombreTutor,
            sede: sedeTutor || 'N/A',
            carrera,
            estado: estadoTutor,
            cantidadMaterias: materiasArr.length,
            materiasTexto: materiasArr.length > 0 ? materiasArr.join(', ') : 'Sin materias',
            sesionesImpartidas: 0,
            minutosAcumulados: 0,
            horasFormateadas: '0h 0m',
            estudiantesSet: new Set<string>(),
            estudiantesAtendidos: 0,
            reservasActivas: 0,
            sumaCalificaciones: 0,
            cantidadCalificaciones: 0,
            calificacionPromedio: 0
          };
        }
      });

      // 2. Procesar Estudiantes base
      queryEstudiantes.forEach((docSnap) => {
        const data = docSnap.data();
        const sedeEst = String(data['sede'] || '').toUpperCase().trim();
        const carreraEst = String(data['carrera'] || 'NO ASIGNADA').trim().toUpperCase();
        const correoEst = String(data['correo'] || data['correo_google'] || '').toLowerCase().trim();
        const nombreEst = String(data['nombre_completo'] || data['nombre'] || 'Sin Nombre').trim();
        const cedulaEst = String(data['cedula'] || '').trim();
        const cicloEst = data['ciclo'] || '';
        const periodoEst = String(data['ultimo_periodo_activo'] || data['periodo'] || '').trim();

        const tienePermisoSede = esSuperAdmin || sedeEst === this.sedeUsuario;
        const cumpleSede = tienePermisoSede && (this.filtroSedeGraficas === 'GLOBAL' || sedeEst === this.filtroSedeGraficas);
        const cumpleCarrera = this.filtroCarreraMetricas === 'TODAS' || carreraEst === this.filtroCarreraMetricas;
        const cumplePeriodo = this.filtroPeriodoMetricas === 'TODOS' || !periodoEst || periodoEst === this.filtroPeriodoMetricas;

        const registroEst = {
          clave: correoEst || cedulaEst || docSnap.id,
          correo: correoEst,
          cedula: cedulaEst,
          nombre: nombreEst,
          sede: sedeEst || 'N/A',
          carrera: carreraEst,
          ciclo: cicloEst,
          tutoriasAsistidas: 0,
          inasistencias: 0,
          minutosRecibidos: 0,
          horasFormateadas: '0h 0m',
          materiasSet: new Set<string>(),
          materiasTexto: 'Ninguna',
          reservasActivas: 0,
          ultimaActividad: 'Sin actividad'
        };

        if (correoEst) mapaEstudiantesPorCorreo[correoEst] = registroEst;
        if (nombreEst) {
          const normNom = nombreEst.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          mapaEstudiantesPorNombre[normNom] = registroEst;
        }

        if (cumpleSede && cumpleCarrera && cumplePeriodo) {
          mapaEstudiantesDetalle[registroEst.clave] = registroEst;
        }
      });

      // 3. Procesar Asistencias (KPIs + detalle de Tutores y Estudiantes)
      let tutoriasImpartidas = 0;
      let minutosTotales = 0;
      const estudiantesSet = new Set<string>();

      queryAsistencias.forEach((docSnap) => {
        const data = docSnap.data();
        const correoTutor = String(data['correoTutor'] || '').toLowerCase().trim();
        const nombreTutorAsis = String(data['nombreTutor'] || 'Tutor').trim();
        const sedeAsis = String(data['sede'] || mapaTutorInfo[correoTutor]?.sede || '').toUpperCase().trim();
        const carreraAsis = String(mapaTutorInfo[correoTutor]?.carrera || 'NO ASIGNADA').toUpperCase().trim();
        const periodoAsis = String(data['periodo'] || '').trim();
        const asistioFlag = String(data['asistio'] || 'SI').toUpperCase().trim();

        const tienePermisoSede = esSuperAdmin || sedeAsis === this.sedeUsuario;
        const cumpleSede = tienePermisoSede && (this.filtroSedeGraficas === 'GLOBAL' || sedeAsis === this.filtroSedeGraficas);
        const cumpleCarrera = this.filtroCarreraMetricas === 'TODAS' || carreraAsis === this.filtroCarreraMetricas;
        const cumplePeriodo = this.filtroPeriodoMetricas === 'TODOS' || periodoAsis === this.filtroPeriodoMetricas;

        if (!cumpleSede || !cumpleCarrera || !cumplePeriodo) return;

        const hrs = Number(data['horas_duracion'] || 0);
        const mins = Number(data['minutos_duracion'] || 0);
        const minsSesion = (hrs * 60) + mins;
        const materiaAsis = String(data['materia'] || '').toUpperCase().trim();
        const correoEstAsis = String(data['correo_estudiante'] || '').toLowerCase().trim();
        const infoEstRaw = String(data['estudiante_info'] || '').trim();
        const nombreEstLimpio = infoEstRaw.split('\n')[0].replace('(Solicitante)', '').trim();
        const fechaAsis = String(data['fecha_impartida'] || data['fecha_registro'] || '').split('T')[0];

        // Asegurar fila del tutor si tuvo actividad en el período aunque no estuviera en la lista previa
        if (!mapaTutoresDetalle[correoTutor] && correoTutor) {
          mapaTutoresDetalle[correoTutor] = {
            correo: correoTutor,
            nombre: nombreTutorAsis,
            sede: sedeAsis || 'N/A',
            carrera: carreraAsis,
            estado: 'ACTIVO',
            cantidadMaterias: materiaAsis ? 1 : 0,
            materiasTexto: materiaAsis || 'N/A',
            sesionesImpartidas: 0,
            minutosAcumulados: 0,
            horasFormateadas: '0h 0m',
            estudiantesSet: new Set<string>(),
            estudiantesAtendidos: 0,
            reservasActivas: 0,
            sumaCalificaciones: 0,
            cantidadCalificaciones: 0,
            calificacionPromedio: 0
          };
        }

        // Localizar o crear fila del estudiante
        let estRow = correoEstAsis ? mapaEstudiantesPorCorreo[correoEstAsis] : null;
        if (!estRow && nombreEstLimpio) {
          const normNom = nombreEstLimpio.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          estRow = mapaEstudiantesPorNombre[normNom] || null;
        }
        if (!estRow && (correoEstAsis || nombreEstLimpio)) {
          const claveNueva = correoEstAsis || nombreEstLimpio.toLowerCase();
          estRow = {
            clave: claveNueva,
            correo: correoEstAsis,
            cedula: '',
            nombre: nombreEstLimpio || correoEstAsis,
            sede: sedeAsis || 'N/A',
            carrera: carreraAsis,
            ciclo: '',
            tutoriasAsistidas: 0,
            inasistencias: 0,
            minutosRecibidos: 0,
            horasFormateadas: '0h 0m',
            materiasSet: new Set<string>(),
            materiasTexto: 'Ninguna',
            reservasActivas: 0,
            ultimaActividad: 'Sin actividad'
          };
          if (correoEstAsis) mapaEstudiantesPorCorreo[correoEstAsis] = estRow;
        }
        if (estRow && !mapaEstudiantesDetalle[estRow.clave]) {
          mapaEstudiantesDetalle[estRow.clave] = estRow;
        }

        if (asistioFlag === 'NO') {
          if (estRow) {
            estRow.inasistencias++;
            if (fechaAsis && (estRow.ultimaActividad === 'Sin actividad' || fechaAsis > estRow.ultimaActividad)) {
              estRow.ultimaActividad = fechaAsis;
            }
          }
          return;
        }

        // Asistencia efectiva (asistio === 'SI')
        tutoriasImpartidas++;
        minutosTotales += minsSesion;

        const idEst = correoEstAsis || infoEstRaw.toLowerCase().trim();
        if (idEst) estudiantesSet.add(idEst);

        if (!resumenCarreras[carreraAsis]) {
          resumenCarreras[carreraAsis] = { tutoresActivos: 0, tutoriasImpartidas: 0 };
        }
        resumenCarreras[carreraAsis].tutoriasImpartidas++;

        if (mapaTutoresDetalle[correoTutor]) {
          const tRow = mapaTutoresDetalle[correoTutor];
          tRow.sesionesImpartidas++;
          tRow.minutosAcumulados += minsSesion;
          if (idEst) tRow.estudiantesSet.add(idEst);
          const calif = Number(data['calificacion_tutor'] || 0);
          if (calif > 0) {
            tRow.sumaCalificaciones += calif;
            tRow.cantidadCalificaciones++;
          }
        }

        if (estRow) {
          estRow.tutoriasAsistidas++;
          estRow.minutosRecibidos += minsSesion;
          if (materiaAsis) estRow.materiasSet.add(materiaAsis);
          if (fechaAsis && (estRow.ultimaActividad === 'Sin actividad' || fechaAsis > estRow.ultimaActividad)) {
            estRow.ultimaActividad = fechaAsis;
          }
        }
      });

      // 4. Cruzar Reservas Activas (PENDIENTE / CONFIRMADA) con Tutores y Estudiantes
      queryReservas.forEach((docSnap) => {
        const data = docSnap.data();
        const estadoRes = String(data['estado'] || 'PENDIENTE').toUpperCase().trim();
        if (estadoRes !== 'PENDIENTE' && estadoRes !== 'CONFIRMADA') return;

        const correoT = String(data['correoTutor'] || '').toLowerCase().trim();
        const correoE = String(data['correoEstudiante'] || '').toLowerCase().trim();

        if (correoT && mapaTutoresDetalle[correoT]) {
          mapaTutoresDetalle[correoT].reservasActivas++;
        }
        if (correoE && mapaEstudiantesPorCorreo[correoE] && mapaEstudiantesDetalle[mapaEstudiantesPorCorreo[correoE].clave]) {
          mapaEstudiantesDetalle[mapaEstudiantesPorCorreo[correoE].clave].reservasActivas++;
        }
      });

      // 5. Procesar Postulaciones Pendientes en el mismo filtro
      let postulacionesPendientes = 0;
      queryPostulaciones.forEach((docSnap) => {
        const data = docSnap.data();
        const sedePost = String(data['sede'] || '').toUpperCase();
        const carreraPost = String(data['carrera'] || '').trim().toUpperCase();
        const periodoPost = String(data['periodo'] || '').trim();

        const tienePermisoSede = esSuperAdmin || sedePost === this.sedeUsuario;
        const cumpleSede = tienePermisoSede && (this.filtroSedeGraficas === 'GLOBAL' || sedePost === this.filtroSedeGraficas);
        const cumpleCarrera = this.filtroCarreraMetricas === 'TODAS' || carreraPost === this.filtroCarreraMetricas;
        const cumplePeriodo = this.filtroPeriodoMetricas === 'TODOS' || !periodoPost || periodoPost === this.filtroPeriodoMetricas;

        if (cumpleSede && cumpleCarrera && cumplePeriodo) {
          postulacionesPendientes++;
        }
      });

      this.metricasAdmin = {
        totalTutores,
        tutoresActivos,
        porcentajeActivos: totalTutores > 0 ? Math.round((tutoresActivos / totalTutores) * 100) : 0,
        tutoriasImpartidas,
        horasImpartidas: Math.round((minutosTotales / 60) * 10) / 10,
        estudiantesUnicos: estudiantesSet.size,
        postulacionesPendientes
      };

      this.desglosePorCarrera = Object.entries(resumenCarreras)
        .map(([carrera, vals]) => ({
          carrera,
          tutoresActivos: vals.tutoresActivos,
          tutoriasImpartidas: vals.tutoriasImpartidas
        }))
        .sort((a, b) => b.tutoriasImpartidas - a.tutoriasImpartidas || b.tutoresActivos - a.tutoresActivos);

      // Finalizar cálculos de Tabla de Tutores
      this.tablaTutoresMaster = Object.values(mapaTutoresDetalle)
        .map((t: any) => {
          const h = Math.floor(t.minutosAcumulados / 60);
          const m = t.minutosAcumulados % 60;
          return {
            ...t,
            horasFormateadas: `${h}h ${m}m`,
            estudiantesAtendidos: t.estudiantesSet.size,
            calificacionPromedio: t.cantidadCalificaciones > 0
              ? Math.round((t.sumaCalificaciones / t.cantidadCalificaciones) * 10) / 10
              : 0
          };
        })
        .sort((a, b) => b.sesionesImpartidas - a.sesionesImpartidas || a.nombre.localeCompare(b.nombre));

      // Finalizar cálculos de Tabla de Estudiantes
      this.tablaEstudiantesMaster = Object.values(mapaEstudiantesDetalle)
        .map((e: any) => {
          const h = Math.floor(e.minutosRecibidos / 60);
          const m = e.minutosRecibidos % 60;
          const mats = Array.from(e.materiasSet) as string[];
          return {
            ...e,
            horasFormateadas: `${h}h ${m}m`,
            materiasTexto: mats.length > 0 ? mats.join(', ') : 'Sin sesiones registradas'
          };
        })
        .sort((a, b) => b.tutoriasAsistidas - a.tutoriasAsistidas || b.reservasActivas - a.reservasActivas || a.nombre.localeCompare(b.nombre));

      this.filtrarTablasDetalle();
      if (this.cdr) this.cdr.detectChanges();
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
    }
  }

  filtrarTablasDetalle() {
    const qTutor = String(this.busquedaTablaTutores || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!qTutor) {
      this.tablaTutoresFiltrada = [...this.tablaTutoresMaster];
    } else {
      this.tablaTutoresFiltrada = this.tablaTutoresMaster.filter(t => {
        const txt = `${t.nombre} ${t.correo} ${t.carrera} ${t.materiasTexto}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return txt.includes(qTutor);
      });
    }

    const qEst = String(this.busquedaTablaEstudiantes || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!qEst) {
      this.tablaEstudiantesFiltrada = [...this.tablaEstudiantesMaster];
    } else {
      this.tablaEstudiantesFiltrada = this.tablaEstudiantesMaster.filter(e => {
        const txt = `${e.nombre} ${e.correo} ${e.cedula} ${e.carrera} ${e.materiasTexto}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return txt.includes(qEst);
      });
    }
  }

  // ==========================================
  // CARTELERA DIGITAL
  // ==========================================
  async publicarAnuncio() {
    if (this.enviandoAnuncio) return;

    if (!this.nuevoAnuncio.titulo || !this.nuevoAnuncio.descripcion) {
      this.mostrarAviso('Por favor, llena el título y la descripción del comunicado.', 'advertencia');
      return;
    }

    this.enviandoAnuncio = true;
    const destinoSeguro = this.rolUsuario === 'ADMIN' ? this.nuevoAnuncio.sede_destino.toUpperCase() : this.sedeUsuario;

    const payload = {
      titulo: this.nuevoAnuncio.titulo.toUpperCase(),
      descripcion: this.nuevoAnuncio.descripcion,
      fecha_evento: this.nuevoAnuncio.fecha_evento || 'Sin fecha',
      fecha_publicacion: new Date().toISOString(),
      sede_destino: destinoSeguro,
      autor: localStorage.getItem('nombre') || 'COORDINACIÓN',
      estado: 'ACTIVO', 
      tipo: 'AVISO'     
    };

    try {
      await addDoc(collection(this.firestore, 'Anuncios'), payload);
      
      await this.dbService.crearNotificacion({
        titulo: 'Nuevo Comunicado Oficial',
        mensaje: this.nuevoAnuncio.titulo.toUpperCase(),
        tipo: 'AVISO',
        rol_destino: 'TODOS',
        sede_destino: destinoSeguro 
      });

      this.mostrarAviso('¡Comunicado oficial publicado con éxito!', 'exito');
      this.nuevoAnuncio = { titulo: '', descripcion: '', fecha_evento: new Date().toISOString(), sede_destino: 'GLOBAL' };
    } catch (error) {
      console.error('Error al publicar:', error);
      this.mostrarAviso('Error al publicar el comunicado.', 'error');
    } finally {
      this.enviandoAnuncio = false;
    }
  }

  async limpiarAnunciosExpirados() {
    try {
      const q = query(collection(this.firestore, 'Anuncios'));
      const snapshot = await getDocs(q);

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      snapshot.forEach(async (documento) => {
        const data = documento.data();
        const fechaEvento = data['fecha_evento'];

        if (fechaEvento && fechaEvento !== 'Sin fecha' && fechaEvento !== '') {
          const soloFecha = fechaEvento.split('T')[0]; 
          const partes = soloFecha.split('-'); 

          if (partes.length === 3) {
            const anio = parseInt(partes[0], 10);
            const mes = parseInt(partes[1], 10) - 1; 
            const dia = parseInt(partes[2], 10);

            const fechaDelAviso = new Date(anio, mes, dia, 23, 59, 59, 999);

            if (fechaDelAviso.getTime() < hoy.getTime()) {
              await deleteDoc(doc(this.firestore, 'Anuncios', documento.id));
            }
          }
        }
      });
    } catch (error) {
      console.error("Error al limpiar anuncios:", error);
    }
  }

  async mostrarAviso(mensaje: string, tipo: 'exito' | 'error' | 'advertencia' | 'info' = 'exito') {
    let icono = 'checkmark-circle-outline';
    let claseCss = 'toast-exito';

    if (tipo === 'error') {
      icono = 'close-circle-outline';
      claseCss = 'toast-error';
    } else if (tipo === 'advertencia') {
      icono = 'warning-outline';
      claseCss = 'toast-advertencia';
    } else if (tipo === 'info') {
      icono = 'information-circle-outline';
      claseCss = 'toast-info';
    }

    const toast = await this.toastController.create({
      message: mensaje,
      duration: 3000,
      position: 'top', 
      icon: icono,
      cssClass: `toast-premium-gietaes ${claseCss}`,
      mode: 'ios' 
    });
    await toast.present();
  }

  async confirmarAccion(cabecera: string, mensaje: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      const alert = await this.alertController.create({
        header: cabecera,
        message: mensaje,
        cssClass: 'alerta-premium-gietaes',
        mode: 'md', 
        buttons: [
          {
            text: 'Cancelar',
            role: 'cancel',
            cssClass: 'btn-alerta-cancelar',
            handler: () => resolve(false)
          },
          {
            text: 'Sí, Continuar',
            cssClass: 'btn-alerta-confirmar',
            handler: () => resolve(true)
          }
        ]
      });
      await alert.present();
    });
  }
}