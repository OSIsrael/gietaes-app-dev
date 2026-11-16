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
  schoolOutline, settingsOutline, logOutOutline, notificationsOutline, peopleOutline, createOutline 
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

  // 🌟 FILTROS DE BANDEJA (SEDE + PERÍODO + CARRERA)
  filtroSedePostulaciones: string = 'GLOBAL';
  filtroPeriodoPostulaciones: string = 'TODOS';
  filtroCarreraPostulaciones: string = 'TODAS';

  // 🌟 FILTROS DE MÉTRICAS NUMÉRICAS (PUNTOS #15 y #16)
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

  abrirModalEditarHorario(estudiante: any) {
    this.estudianteEditando = estudiante;
    this.horarioTemporalAdmin = { ...estudiante.horarios }; 
    this.mostrarModalEditarHorario = true;
  }

  seleccionarModalidadGlobalAdmin(mod: string) {
    this.modalidadGlobalAdmin = mod;
  }

  seleccionarBloqueAdmin(dia: string, franja: string) {
    const clave = `${dia}-${franja}`;
    if (this.horarioTemporalAdmin[clave]) {
      delete this.horarioTemporalAdmin[clave];
    } else {
      this.horarioTemporalAdmin[clave] = this.modalidadGlobalAdmin;
    }
  }

  guardarHorarioEditado() {
    if (this.estudianteEditando) {
      this.estudianteEditando.horarios = { ...this.horarioTemporalAdmin };
      this.estudianteEditando.materias_postuladas.forEach((postulacion: any) => {
        postulacion.horarios = { ...this.horarioTemporalAdmin };
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
      notificationsOutline, peopleOutline, createOutline
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
    await this.cargarEstadisticas();
    this.limpiarAnunciosExpirados();
    this.cargarTutoriasEnAlerta();
  }

  // 🌟 CARGA DINÁMICA DE PERÍODOS Y CARRERAS DISPONIBLES
  async cargarOpcionesFiltros() {
    const periodosSet = new Set<string>();
    const carrerasSet = new Set<string>();

    if (this.dbService.periodo_actual) {
      periodosSet.add(String(this.dbService.periodo_actual).trim());
    }

    try {
      const [snapTutores, snapAsistencias, snapPostulaciones] = await Promise.all([
        getDocs(collection(this.firestore, 'Tutores')),
        getDocs(collection(this.firestore, 'Asistencias')),
        getDocs(collection(this.firestore, 'Postulaciones'))
      ]);

      snapTutores.forEach(d => {
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
        const sedeReserva = String(data['sede'] || data['sedeEstudiante'] || '').toUpperCase();
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
            horarios: post['disponibilidad_horaria'], 
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
          const horariosPropuestos = post.horarios || post.disponibilidad_horaria || {};
          
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
  // 🌟 PUNTOS #15 y #16: INDICADORES NUMÉRICOS SOBRIOS + FILTROS (SEDE/PERÍODO/CARRERA)
  // ==========================================================================
  async cargarEstadisticas() {
    try {
      const [queryTutores, queryAsistencias, queryPostulaciones] = await Promise.all([
        getDocs(collection(this.firestore, 'Tutores')),
        getDocs(collection(this.firestore, 'Asistencias')),
        getDocs(query(collection(this.firestore, 'Postulaciones'), where('estado_aprobacion', '==', 'PENDIENTE')))
      ]);

      const esSuperAdmin = this.rolUsuario === 'ADMIN';
      const mapaTutorInfo: { [correo: string]: { carrera: string; sede: string } } = {};
      const resumenCarreras: { [carrera: string]: { tutoresActivos: number; tutoriasImpartidas: number } } = {};

      let totalTutores = 0;
      let tutoresActivos = 0;

      // 1. Procesar Tutores
      queryTutores.forEach((docSnap) => {
        const data = docSnap.data();
        const sedeTutor = String(data['sede'] || '').toUpperCase();
        const estadoTutor = String(data['estado'] || '').toUpperCase();
        const correoTutor = String(data['correo'] || data['correo_google'] || '').toLowerCase().trim();
        const carrera = String(data['carrera'] || 'NO ASIGNADA').trim().toUpperCase();
        const periodoTutor = String(data['ultimo_periodo_activo'] || data['periodo'] || '').trim();

        const tienePermisoSede = esSuperAdmin || sedeTutor === this.sedeUsuario;
        const cumpleSede = tienePermisoSede && (this.filtroSedeGraficas === 'GLOBAL' || sedeTutor === this.filtroSedeGraficas);
        if (!cumpleSede) return;

        // Guardamos el mapa completo de la sede para cruzar con asistencias históricas
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
        }
      });

      // 2. Procesar Asistencias (Tutorías Impartidas, Horas y Estudiantes Únicos)
      let tutoriasImpartidas = 0;
      let minutosTotales = 0;
      const estudiantesSet = new Set<string>();

      queryAsistencias.forEach((docSnap) => {
        const data = docSnap.data();
        const correoTutor = String(data['correoTutor'] || '').toLowerCase().trim();
        const sedeAsis = String(data['sede'] || mapaTutorInfo[correoTutor]?.sede || '').toUpperCase();
        const carreraAsis = String(mapaTutorInfo[correoTutor]?.carrera || 'NO ASIGNADA').toUpperCase();
        const periodoAsis = String(data['periodo'] || '').trim();

        const tienePermisoSede = esSuperAdmin || sedeAsis === this.sedeUsuario;
        const cumpleSede = tienePermisoSede && (this.filtroSedeGraficas === 'GLOBAL' || sedeAsis === this.filtroSedeGraficas);
        const cumpleCarrera = this.filtroCarreraMetricas === 'TODAS' || carreraAsis === this.filtroCarreraMetricas;
        const cumplePeriodo = this.filtroPeriodoMetricas === 'TODOS' || periodoAsis === this.filtroPeriodoMetricas;

        if (cumpleSede && cumpleCarrera && cumplePeriodo) {
          tutoriasImpartidas++;
          const hrs = Number(data['horas_duracion'] || 0);
          const mins = Number(data['minutos_duracion'] || 0);
          minutosTotales += (hrs * 60) + mins;

          const idEst = String(data['correo_estudiante'] || data['estudiante_info'] || '').toLowerCase().trim();
          if (idEst) estudiantesSet.add(idEst);

          if (!resumenCarreras[carreraAsis]) {
            resumenCarreras[carreraAsis] = { tutoresActivos: 0, tutoriasImpartidas: 0 };
          }
          resumenCarreras[carreraAsis].tutoriasImpartidas++;
        }
      });

      // 3. Procesar Postulaciones Pendientes en el mismo filtro
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

      if (this.cdr) this.cdr.detectChanges();
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
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