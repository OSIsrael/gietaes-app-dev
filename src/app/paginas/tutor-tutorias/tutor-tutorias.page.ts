import { Component, OnInit, inject, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { 
  IonContent, IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, 
  IonList, IonItemSliding, IonItem, IonItemOptions, IonItemOption,
  IonLabel, IonModal, ToastController, AlertController, IonPopover
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  notificationsOutline, bookOutline, logoWhatsapp, 
  personOutline, person, timeOutline, calendarOutline, trashOutline,
  checkmarkCircleOutline, closeCircleOutline, closeOutline, helpCircleOutline, 
  informationCircleOutline, documentTextOutline, swapHorizontalOutline, schoolOutline, 
  briefcaseOutline, shieldCheckmarkOutline, chevronDownOutline, chevronBackOutline,
  informationCircle, closeCircle, personCircleOutline, checkmarkCircle, 
  settingsOutline, logOutOutline, businessOutline, addCircleOutline, createOutline
} from 'ionicons/icons';
import { Firestore, collection, query, where, getDocs, doc, updateDoc, deleteDoc, getDoc } from '@angular/fire/firestore';
import { DatabaseService } from '../../services/database';
import { TutorEstadoService } from '../../services/tutor-estado.service';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Auth, signOut } from '@angular/fire/auth';

@Component({
  selector: 'app-tutor-tutorias',
  templateUrl: './tutor-tutorias.page.html',
  styleUrls: ['./tutor-tutorias.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, 
    IonButtons, IonButton, IonIcon, IonList, IonItemSliding, 
    IonItem, IonItemOptions, IonItemOption, IonPopover, IonLabel, IonModal
  ]
})
export class TutorTutoriasPage implements OnInit {
  private dbService = inject(DatabaseService);
  private tutorEstado = inject(TutorEstadoService);
  private firestore = inject(Firestore);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private auth = inject(Auth);

  mostrarModalRenovacionTutor: boolean = false;
  decisionTutor: string = '';
  nuevoCicloTutor: number = 0;
  permanenciaTutor: string = ''; 
  periodoApp: string = '';
  tutorDocId: string = '';
  pasoActual: number = 1;

  materiasCatalogo: any[] = [];
  materiasDisponibles: string[] = [];
  materiasSeleccionadas: string[] = [];
  materiasTutor: string[] = [];
  diassemana = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  franjasHorarias = ['7:00 - 9:00', '09:00 - 11:00', '11:00 - 13:00', '14:00 - 16:00', '16:00 - 18:00', '18:00 - 20:00', '20:00 - 22:00'];
  horarioSeleccionado: { [key: string]: string } = {}; 
  modalidadGlobal: string = 'PRESENCIAL';

  datosTutorActual: any = null; 

  private toastController = inject(ToastController);
  private alertController = inject(AlertController);
  
  tienePanelTutor: boolean = false;
  tienePanelAdmin: boolean = false;

  tutoriasPorImpartir: any[] = [];
  cargando: boolean = true;
  correoUsuario: string = '';
  nombreUsuario: string = ''; 
  rolUsuario: string = '';
  hayNotificacionesSinLeer: boolean = false;
  mostrarGuiaTutor: boolean = false;

  @ViewChild('popoverEstado') popoverEstado!: IonPopover;
  menuEstadoAbierto: boolean = false;
  tutoriaSeleccionada: any = null;

  menuRolAbierto: boolean = false;
  eventoRol: any = null;
  menuPerfilAbierto: boolean = false;
  eventoPerfil: any = null;

 // =========================================================
  // 🌟 VARIABLES PUNTO #12: REGISTRO MANUAL ESPONTÁNEO
  // =========================================================
  mostrarModalManual: boolean = false;
  guardandoManual: boolean = false;
  todosEstudiantes: any[] = [];
  busquedaEstudianteManual: string = '';
  estudiantesFiltradosManual: any[] = [];

  todosDocentesExcel: string[] = [];
  docentesFiltradosManual: string[] = [];

  formManual = {
    correoEstudiante: '',
    nombreEstudiante: '',
    celularEstudiante: '',
    codigoPaisEstudiante: '+593',
    materia: '',
    dia_elegido: 'Lunes',
    hora_elegida: '09:00 - 11:00',
    modalidad: 'PRESENCIAL',
    tipo_tutoria: 'CONSULTA',
    tipo_derivacion: 'DECISIÓN PROPIA',
    docente: ''
  };
  // =========================================================
  // 🌟 VARIABLES PUNTO #6: REPROGRAMAR FECHA / HORA
  // =========================================================
  mostrarModalReprogramar: boolean = false;
  guardandoReprogramacion: boolean = false;
  tutoriaAReprogramar: any = null;
  formReprogramar = {
    dia_elegido: 'Lunes',
    hora_elegida: '09:00 - 11:00',
    fecha_exacta: '',
    motivo: ''
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

  constructor() {
    addIcons({
      personCircleOutline, swapHorizontalOutline, helpCircleOutline, notificationsOutline,
      calendarOutline, bookOutline, informationCircleOutline, personOutline, person, timeOutline,
      chevronDownOutline, logoWhatsapp, trashOutline, checkmarkCircleOutline, documentTextOutline,
      closeOutline, schoolOutline, briefcaseOutline, shieldCheckmarkOutline, chevronBackOutline,
      closeCircleOutline, informationCircle, checkmarkCircle, closeCircle, settingsOutline,
      logOutOutline, businessOutline, addCircleOutline, createOutline
    });
  }

  ngOnInit() { }

  async ionViewWillEnter() {
    // 🌟 PUNTO #12: Ocultar pestaña Asistencia por defecto al estar en Tutorías
    this.tutorEstado.ocultarTabAsistencia();

    this.correoUsuario = (localStorage.getItem('correo') || '').toLowerCase().trim();
    this.nombreUsuario = localStorage.getItem('nombre') || ''; 
    this.rolUsuario = (localStorage.getItem('rol') || 'ESTUDIANTE').toUpperCase();
    
    await this.cargarPermisosPaneles(this.correoUsuario);

    await this.dbService.cargarConfiguracionGlobal(true);
    this.periodoApp = this.dbService.periodo_actual;
    
    const sede = localStorage.getItem('sede') || 'CUENCA';

    if (this.correoUsuario) {
      const qTut = query(collection(this.firestore, 'Tutores'), where('correo_google', '==', this.correoUsuario));
      const snapTut = await getDocs(qTut);
      if (!snapTut.empty) {
        this.tutorDocId = snapTut.docs[0].id;
        const datosTut = snapTut.docs[0].data();
        this.datosTutorActual = datosTut;
        this.materiasTutor = datosTut['materias'] || [];
        
        if (datosTut['ultimo_periodo_activo'] !== this.periodoApp) {
          this.abrirRenovacion(); 
        }
      }
    }
    
    await this.verificarNotificaciones(this.correoUsuario, this.rolUsuario, sede);
    await this.cargarTutoriasPorImpartir();
    const guiaTutorVista = localStorage.getItem('guia_tutor_vista');
    if (!guiaTutorVista) {
      this.mostrarGuiaTutor = true;
      localStorage.setItem('guia_tutor_vista', 'true'); 
    }
  }

  async verificarNotificaciones(correo: string, rol: string, sede: string) {
    try {
      const notifs = await this.dbService.obtenerNotificacionesUsuario(correo, rol, sede, 'TUTOR');
      const sinLeer = notifs.filter((n: any) => {
        const leidas = n['leida_por'] || [];
        return !leidas.includes(correo);
      });
      this.hayNotificacionesSinLeer = sinLeer.length > 0;
    } catch (error) {}
  }

  irANotificaciones() {
    this.router.navigate(['/notificaciones'], { queryParams: { panel: 'TUTOR' } });
  }

  calcularFechaPorDia(diaElegido: string): string {
    const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    
    const diaNormalizado = diaElegido.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const diaIndex = dias.indexOf(diaNormalizado);
    const hoy = new Date();
    
    if (diaIndex !== -1) {
      const hoyIndex = hoy.getDay();
      let diasFaltantes = diaIndex - hoyIndex;
      if (diasFaltantes < 0) diasFaltantes += 7; 
      
      const fecha = new Date(hoy);
      fecha.setDate(hoy.getDate() + diasFaltantes);
      return `${fecha.getDate()} de ${meses[fecha.getMonth()]}`;
    }
    return '';
  }

  async cargarTutoriasPorImpartir() {
    this.cargando = true;
    this.tutoriasPorImpartir = [];

    try {
      const correoLimpio = (this.correoUsuario || localStorage.getItem('correo') || '').toLowerCase().trim();
      const qTutor = query(collection(this.firestore, 'Reservas'), where('correoTutor', '==', correoLimpio));
      const snapshot = await getDocs(qTutor);

      const tutoriasAgrupadas = new Map<string, any>();
      const tutoriasIndividuales: any[] = [];

      snapshot.forEach(documento => {
        const res = documento.data();
        const estadoUpper = String(res['estado'] || '').toUpperCase().trim();
        if (estadoUpper === 'CANCELADA' || estadoUpper === 'FINALIZADA') return;

        let colorEstado = '#fde047'; 
        if (estadoUpper === 'CONFIRMADA' || estadoUpper === 'ACEPTADA') colorEstado = '#34d399'; 

        const diaElegido = res['dia_elegido'] || res['dia'] || 'Por definir';
        
        let fechaExacta = res['fecha_exacta'];
        if (!fechaExacta && diaElegido !== 'Por definir') {
          fechaExacta = this.calcularFechaPorDia(diaElegido);
        }

        const esInvitadoFlag = Boolean(res['esInvitado'] || res['es_invitado']);

        const tutoriaFormateada: any = {
          id: documento.id,
          materia: res['materia'],
          codigo: res['codigo'] || res['codigo_tutoria'] || 'SIN CÓDIGO',
          dia: diaElegido,
          hora: res['hora_elegida'] || res['hora'] || 'Por definir',
          duracion_horas: res['duracion_horas'] || 1,
          fecha_exacta: fechaExacta || '',
          modalidad: res['modalidad'] || 'Presencial', 
          color: colorEstado,
          estado: res['estado'],
          celularEstudiante: res['celularEstudiante'], 
          codigoPaisEstudiante: res['codigoPaisEstudiante'] || '+593', 
          nombreEstudiante: res['nombreEstudiante'],
          correoEstudiante: res['correoEstudiante'],
          tipoDerivacion: res['tipo_derivacion'] || 'DECISIÓN PROPIA',
          tipo_tutoria: res['tipo_tutoria'] || 'CONSULTA',
          tipo_flujo: res['tipo_flujo'] || 'CONSULTA',
          fecha_agendamiento: res['fecha_agendamiento'] || res['fecha_solicitud'] || null,
          fecha_modificacion_tutor: res['fecha_modificacion_tutor'] || null,
          esInvitado: esInvitadoFlag,
          es_invitado: esInvitadoFlag, 
          docente: res['docente'] || res['nombreDocente'] || res['docenteEstudiante'] || res['nombre_docente'] || '', 
          alumnosExtra: [] 
        };

        if (tutoriaFormateada.codigo !== 'SIN CÓDIGO') {
          if (tutoriasAgrupadas.has(tutoriaFormateada.codigo)) {
            const master = tutoriasAgrupadas.get(tutoriaFormateada.codigo);
            if (!tutoriaFormateada.esInvitado && master.esInvitado) {
              tutoriaFormateada.alumnosExtra = [...master.alumnosExtra, master];
              tutoriasAgrupadas.set(tutoriaFormateada.codigo, tutoriaFormateada);
            } else {
              master.alumnosExtra.push(tutoriaFormateada);
            }
          } else {
            tutoriasAgrupadas.set(tutoriaFormateada.codigo, tutoriaFormateada);
          }
        } else {
          tutoriasIndividuales.push(tutoriaFormateada);
        }
      });

      this.tutoriasPorImpartir = [...Array.from(tutoriasAgrupadas.values()), ...tutoriasIndividuales];

    } catch (error) {
      console.error("Error cargando la agenda del tutor:", error);
    } finally {
      this.cargando = false;
      if (this.cdr) this.cdr.detectChanges();
    }
  }

  // 🌟 PUNTO #12: Habilita la pestaña Asistencia en tabs-tutor y navega con los datos de la tutoría
  irATomarAsistencia(tutoria: any) {
    this.tutorEstado.habilitarTabAsistencia();
    this.router.navigate(['/tabs-tutor/asistencia'], {
      state: { tutoriaMaster: tutoria }
    });
  }

// =========================================================
  // 🌟 MÉTODOS PUNTO #12: REGISTRO MANUAL ESPONTÁNEO
  // =========================================================
  async abrirModalManual() {
    const diasMap = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    const diaHoy = diasMap[new Date().getDay()];
    const diaDefault = this.diassemana.includes(diaHoy) ? diaHoy : 'Lunes';

    this.formManual = {
      correoEstudiante: '',
      nombreEstudiante: '',
      celularEstudiante: '',
      codigoPaisEstudiante: '+593',
      materia: this.materiasTutor[0] || '',
      dia_elegido: diaDefault,
      hora_elegida: '09:00 - 11:00',
      modalidad: 'PRESENCIAL',
      tipo_tutoria: 'CONSULTA',
      tipo_derivacion: 'DECISIÓN PROPIA',
      docente: ''
    };
    this.busquedaEstudianteManual = '';
    this.estudiantesFiltradosManual = [];
    this.docentesFiltradosManual = [];
    this.mostrarModalManual = true;

    const sedeTutor = (this.datosTutorActual?.sede || localStorage.getItem('sede') || 'CUENCA').toUpperCase();

    // Cargamos estudiantes y docentes desde Excel en paralelo si aún no están en memoria
    const promesas: Promise<any>[] = [];

    if (this.todosEstudiantes.length === 0) {
      promesas.push(
        getDocs(collection(this.firestore, 'Estudiantes'))
          .then(snap => { this.todosEstudiantes = snap.docs.map(d => d.data()); })
          .catch(e => console.error('Error cargando estudiantes:', e))
      );
    }

    if (this.todosDocentesExcel.length === 0) {
      promesas.push(
        this.dbService.obtenerDocentesDesdeExcel(sedeTutor)
          .then(lista => { this.todosDocentesExcel = lista || []; })
          .catch(e => console.error('Error cargando docentes Excel:', e))
      );
    }

    await Promise.all(promesas);
  }

  filtrarEstudiantesManual() {
    const txt = this.busquedaEstudianteManual.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!txt) {
      this.estudiantesFiltradosManual = [];
      return;
    }
    this.estudiantesFiltradosManual = this.todosEstudiantes.filter(e => {
      const completo = `${e.nombre_completo || ''} ${e.cedula || ''} ${e.correo_google || ''}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return completo.includes(txt);
    }).slice(0, 5);
  }

  seleccionarEstudianteManual(est: any) {
    this.formManual.correoEstudiante = String(est.correo_google || est.correo || '').toLowerCase().trim();
    this.formManual.nombreEstudiante = est.nombre_completo || 'Estudiante';
    this.formManual.celularEstudiante = est.celular || '';
    this.formManual.codigoPaisEstudiante = est.codigo_pais || '+593';
    this.busquedaEstudianteManual = '';
    this.estudiantesFiltradosManual = [];
  }

  limpiarEstudianteManual() {
    this.formManual.correoEstudiante = '';
    this.formManual.nombreEstudiante = '';
    this.formManual.celularEstudiante = '';
  }

  filtrarDocentesManual() {
    const txt = (this.formManual.docente || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!txt || this.todosDocentesExcel.length === 0) {
      this.docentesFiltradosManual = [];
      return;
    }
    this.docentesFiltradosManual = this.todosDocentesExcel.filter(d =>
      d.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(txt)
    ).slice(0, 6);
  }

  seleccionarDocenteManual(nombreDocente: string) {
    this.formManual.docente = nombreDocente;
    this.docentesFiltradosManual = [];
  }

  async guardarTutoriaManual(irDirectoAAsistencia: boolean) {
    if (!this.formManual.correoEstudiante || !this.formManual.materia.trim()) {
      this.mostrarAviso('Selecciona un estudiante y la materia impartida.', 'advertencia');
      return;
    }

    this.guardandoManual = true;
    try {
      const fechaExacta = this.calcularFechaPorDia(this.formManual.dia_elegido);
      const codigoGenerado = this.dbService.generarCodigoTutoria(this.formManual.materia);
      const sedeTutor = (this.datosTutorActual?.sede || localStorage.getItem('sede') || 'CUENCA').toUpperCase();
      const tipoTutoriaElegido = this.formManual.tipo_tutoria || 'CONSULTA';

      const payloadReserva = {
        correoEstudiante: this.formManual.correoEstudiante,
        nombreEstudiante: this.formManual.nombreEstudiante,
        celularEstudiante: this.formManual.celularEstudiante,
        codigoPaisEstudiante: this.formManual.codigoPaisEstudiante,
        correoTutor: this.correoUsuario,
        nombreTutor: this.nombreUsuario || this.datosTutorActual?.nombre || 'Tutor',
        celularTutor: this.datosTutorActual?.celular || localStorage.getItem('celular') || '',
        codigoPaisTutor: '+593',
        materia: this.formManual.materia.trim().toUpperCase(),
        dia_elegido: this.formManual.dia_elegido,
        hora_elegida: this.formManual.hora_elegida,
        duracion_horas: 2,
        fecha_exacta: fechaExacta,
        modalidad: this.formManual.modalidad,
        sedeTutor: sedeTutor,
        tipo_tutoria: tipoTutoriaElegido,
        tipo_flujo: tipoTutoriaElegido === 'PROCESO' ? 'PROCESO' : 'CONSULTA',
        tipo_derivacion: this.formManual.tipo_derivacion,
        docente: this.formManual.docente.trim() || 'No especificado',
        codigo: codigoGenerado,
        estado: 'CONFIRMADA',
        registro_manual_espontaneo: true
      };

      const docRef = await this.dbService.agendarTutoria(payloadReserva);

      await this.dbService.crearNotificacion({
        titulo: '📝 Tutoría Espontánea Registrada',
        mensaje: `El tutor ${payloadReserva.nombreTutor} registró tu sesión de ${payloadReserva.materia} (${fechaExacta}).`,
        tipo: 'TUTORIA',
        correo_destino: payloadReserva.correoEstudiante,
        rol_destino: 'ESTUDIANTE'
      });

      this.guardandoManual = false;
      this.mostrarModalManual = false;
      if (this.cdr) this.cdr.detectChanges();

      this.mostrarAviso('Tutoría manual registrada correctamente.', 'exito');

      if (irDirectoAAsistencia) {
        const tutoriaMaster = {
          id: docRef.id,
          ...payloadReserva,
          dia: payloadReserva.dia_elegido,
          hora: payloadReserva.hora_elegida,
          tipoDerivacion: payloadReserva.tipo_derivacion,
          alumnosExtra: []
        };
        // Esperamos a que Ionic cierre la animación del modal antes de cambiar de ruta
        setTimeout(() => {
          this.irATomarAsistencia(tutoriaMaster);
        }, 180);
      } else {
        await this.cargarTutoriasPorImpartir();
      }
    } catch (error) {
      console.error('Error creando tutoría manual:', error);
      this.guardandoManual = false;
      this.mostrarAviso('No se pudo registrar la tutoría manual.', 'error');
    }
  }

  // =========================================================
  // 🌟 MÉTODOS PUNTO #6: REPROGRAMAR FECHA / HORA + NOTIFICACIÓN
  // =========================================================
  abrirModalReprogramar(tutoria: any) {
    this.tutoriaAReprogramar = tutoria;
    const diaInicial = this.diassemana.includes(tutoria.dia) ? tutoria.dia : 'Lunes';
    this.formReprogramar = {
      dia_elegido: diaInicial,
      hora_elegida: this.franjasHorarias.includes(tutoria.hora) ? tutoria.hora : '09:00 - 11:00',
      fecha_exacta: tutoria.fecha_exacta || this.calcularFechaPorDia(diaInicial),
      motivo: ''
    };
    this.mostrarModalReprogramar = true;
  }

  actualizarFechaSugeridaReprogramacion() {
    this.formReprogramar.fecha_exacta = this.calcularFechaPorDia(this.formReprogramar.dia_elegido);
  }

  async confirmarReprogramacion() {
    if (!this.tutoriaAReprogramar || !this.formReprogramar.fecha_exacta.trim()) {
      this.mostrarAviso('Completa la fecha y hora de reprogramación.', 'advertencia');
      return;
    }

    this.guardandoReprogramacion = true;
    try {
      await this.dbService.reprogramarReservaTutor(
        this.tutoriaAReprogramar.id,
        this.tutoriaAReprogramar.codigo,
        {
          dia_elegido: this.formReprogramar.dia_elegido,
          hora_elegida: this.formReprogramar.hora_elegida,
          fecha_exacta: this.formReprogramar.fecha_exacta.trim(),
          motivo: this.formReprogramar.motivo.trim()
        }
      );

      this.mostrarModalReprogramar = false;
      this.mostrarAviso('Tutoría reprogramada y estudiante notificado.', 'exito');
      await this.cargarTutoriasPorImpartir();
    } catch (error) {
      console.error('Error reprogramando tutoría:', error);
      this.mostrarAviso('Error al reprogramar la tutoría.', 'error');
    } finally {
      this.guardandoReprogramacion = false;
    }
  }

  contactarEstudiante(celular: string, codigoPais: string, nombre: string, materia: string) {
    if (!celular || celular === 'No registrado' || celular.trim() === '') {
      this.mostrarAviso("El estudiante no registró su número celular.", 'error');
      return;
    }
    
    let celFormateado = celular.replace(/\D/g, ''); 
    if (celFormateado.startsWith('0')) {
      celFormateado = celFormateado.substring(1);
    }
    
    let prefijo = (codigoPais || '+593').replace(/\D/g, ''); 
    const numeroFinal = prefijo + celFormateado;
    
    const mensaje = encodeURIComponent(`Hola ${nombre}, soy tu tutor para la materia de ${materia}. Te escribo para coordinar nuestra sesión.`);
    const urlWa = `https://wa.me/${numeroFinal}?text=${mensaje}`;
    window.open(urlWa, '_blank');
  }

  abrirMenuEstado(evento: any, tutoria: any) {
    evento.stopPropagation(); 
    this.tutoriaSeleccionada = tutoria;
    this.popoverEstado.event = evento; 
    this.menuEstadoAbierto = true;
  }

  seleccionarNuevoEstado(nuevoEstado: string, nuevoColor: string) {
    this.menuEstadoAbierto = false; 
    if (this.tutoriaSeleccionada) {
      if (nuevoEstado === 'CANCELADA') {
        this.cancelarTutoriaInteligente(this.tutoriaSeleccionada);
      } else {
        this.actualizarEstadoFirebase(this.tutoriaSeleccionada, nuevoEstado, nuevoColor);
      }
    }
  }

  async actualizarEstadoFirebase(tutoria: any, nuevoEstado: string, nuevoColor: string) {
    const index = this.tutoriasPorImpartir.findIndex(t => t.id === tutoria.id);
    if (index !== -1) {
      this.tutoriasPorImpartir[index].estado = nuevoEstado;
      this.tutoriasPorImpartir[index].color = nuevoColor;
      this.tutoriasPorImpartir = [...this.tutoriasPorImpartir]; 
    }

    try {
      const tutoriaRef = doc(this.firestore, 'Reservas', tutoria.id);
      await updateDoc(tutoriaRef, { estado: nuevoEstado });

      if (tutoria.alumnosExtra && tutoria.alumnosExtra.length > 0) {
        for (const extra of tutoria.alumnosExtra) {
          await updateDoc(doc(this.firestore, 'Reservas', extra.id), { estado: nuevoEstado });
        }
      }

      if (nuevoEstado === 'CONFIRMADA' || nuevoEstado === 'ACEPTADA') {
        await this.programarRecordatoriosTutor(tutoria);
      }
    } catch (error) {
      this.mostrarAviso("Error al guardar el estado.", 'error');
      return;
    }

    try {
      if (this.dbService.crearNotificacion) {
        await this.dbService.crearNotificacion({
          titulo: `Tutoría ${nuevoEstado}`,
          mensaje: `El tutor ha marcado tu tutoría de ${tutoria.materia} como ${nuevoEstado}.`,
          tipo: 'TUTORIA',
          correo_destino: tutoria.correoEstudiante || 'sin_correo',
          rol_destino: 'ESTUDIANTE' 
        });
      }
    } catch (notiError) {}
  }

  calcularProximaFecha(diaElegido: string, horaElegida: string): Date {
    const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const diaNormalizado = diaElegido.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const diaIndex = dias.indexOf(diaNormalizado);

    const hoy = new Date();
    let fecha = new Date(hoy);

    if (diaIndex !== -1) {
      const hoyIndex = hoy.getDay();
      let diasFaltantes = diaIndex - hoyIndex;
      if (diasFaltantes < 0) diasFaltantes += 7; 
      fecha.setDate(hoy.getDate() + diasFaltantes);
    }

    const horaLimpia = horaElegida.split('-')[0].replace(/[^0-9:]/g, '').trim();
    if (horaLimpia.includes(':')) {
      const partes = horaLimpia.split(':');
      fecha.setHours(parseInt(partes[0], 10), parseInt(partes[1], 10), 0, 0);
    }
    return fecha;
  }

  generarIdNumerico(idString: string): number {
    let hash = 0;
    if (!idString) return Math.floor(Math.random() * 100000);
    for (let i = 0; i < idString.length; i++) {
      hash = (hash << 5) - hash + idString.charCodeAt(i);
      hash |= 0; 
    }
    return Math.abs(hash);
  }

  async programarRecordatoriosTutor(tutoria: any) {
    if (tutoria.dia === 'Por definir' || tutoria.hora === 'Por definir') return;

    const fechaTutoria = this.calcularProximaFecha(tutoria.dia, tutoria.hora);
    const ahora = new Date().getTime();
    const notificaciones = [];
    const idBase = this.generarIdNumerico(tutoria.id);

    const tiempo1Hora = fechaTutoria.getTime() - (60 * 60 * 1000);
    if (tiempo1Hora > ahora) {
      notificaciones.push({
        id: idBase + 50, 
        title: '¡Tutoría a punto de empezar! ⏰',
        body: `En 1 hora impartirás ${tutoria.materia} a ${tutoria.nombreEstudiante}.`,
        schedule: { at: new Date(tiempo1Hora) }
      });
    }

    const fechaMismoDia = new Date(fechaTutoria);
    fechaMismoDia.setHours(8, 0, 0, 0);
    const tiempoMismoDia = fechaMismoDia.getTime();

    if (tiempoMismoDia > ahora && tiempoMismoDia < tiempo1Hora) {
      notificaciones.push({
        id: idBase + 51, 
        title: 'Hoy tienes tutorías programadas ',
        body: `Hoy impartirás una tutoría de ${tutoria.materia} a ${tutoria.nombreEstudiante}.`,
        schedule: { at: new Date(tiempoMismoDia) }
      });
    }

    if (notificaciones.length > 0) {
      let permStatus = await LocalNotifications.checkPermissions();
      if (permStatus.display !== 'granted') {
        permStatus = await LocalNotifications.requestPermissions();
      }
      if (permStatus.display === 'granted') {
        await LocalNotifications.schedule({ notifications: notificaciones });
      }
    }
  }

  async eliminarTutoria(tutoria: any) {
    this.cancelarTutoriaInteligente(tutoria);
  }

  async cancelarTutoriaInteligente(tutoria: any) {
    const confirmar = await this.confirmarAccion(
      '¿Estás seguro de CANCELAR esta tutoría?',
      'El sistema buscará automáticamente otro tutor disponible en este mismo horario.'
    );
    if (!confirmar) return;

    this.procesarCancelacion(tutoria);
  }

  async procesarCancelacion(tutoria: any) {
    this.tutoriasPorImpartir = [...this.tutoriasPorImpartir.filter(t => t.id !== tutoria.id)];

    try {
      const tutoriaRef = doc(this.firestore, 'Reservas', tutoria.id);
      const snap = await getDoc(tutoriaRef);
      const data = snap.data();
      const yaReasignada = data ? data['reasignada_automaticamente'] : false;

      if (yaReasignada) {
        await updateDoc(tutoriaRef, {
          estado: 'REQUIERE_ADMIN',
          correoTutor: 'POR_ASIGNAR', 
          notas_admin: 'Cancelada por el segundo tutor asignado. Requiere asignación manual.'
        });
        // 🌟 PUNTO #11: Notificar al estudiante que Coordinación gestionará la reasignación
        if (tutoria.correoEstudiante) {
          await this.dbService.crearNotificacion({
            titulo: '⚠️ Reasignación en Proceso',
            mensaje: `Tu tutoría de ${tutoria.materia} fue derivada a Coordinación para asignarte un nuevo tutor.`,
            tipo: 'TUTORIA',
            correo_destino: tutoria.correoEstudiante,
            rol_destino: 'ESTUDIANTE'
          });
        }
        this.mostrarAviso('Esta tutoría ya había sido reasignada antes. Se ha enviado una alerta a Coordinación.', 'info');
      } else {
        const nuevoTutor = await this.buscarTutorReemplazo(tutoria.materia, tutoria.dia, tutoria.hora, this.correoUsuario);

        if (nuevoTutor) {
          const correoNuevoTutor = String(nuevoTutor.correo || nuevoTutor.correo_google).toLowerCase().trim();
          const nombreNuevoTutor = nuevoTutor.nombre.toUpperCase();

          await updateDoc(tutoriaRef, {
            correoTutor: correoNuevoTutor, 
            nombreTutor: nombreNuevoTutor,
            celularTutor: nuevoTutor.celular || 'No registrado',
            reasignada_automaticamente: true, 
            estado: 'PENDIENTE'
          });

          // 🌟 PUNTO #11: Disparadores de notificación al reasignar automáticamente (Estudiante + Nuevo Tutor)
          if (tutoria.correoEstudiante) {
            await this.dbService.crearNotificacion({
              titulo: '🔄 Tutor Reasignado Automáticamente',
              mensaje: `Tu tutoría de ${tutoria.materia} (${tutoria.dia} ${tutoria.hora}) fue reasignada al tutor ${nombreNuevoTutor}.`,
              tipo: 'REASIGNACION',
              correo_destino: tutoria.correoEstudiante,
              rol_destino: 'ESTUDIANTE'
            });
          }

          await this.dbService.crearNotificacion({
            titulo: '📥 Nueva Tutoría Reasignada',
            mensaje: `Se te ha asignado automáticamente la tutoría de ${tutoria.materia} con ${tutoria.nombreEstudiante} (${tutoria.dia} ${tutoria.hora}).`,
            tipo: 'REASIGNACION',
            correo_destino: correoNuevoTutor,
            rol_destino: 'TUTOR'
          });

          this.mostrarAviso(`Tutoría cancelada y reasignada a ${nombreNuevoTutor}.`, 'exito');
        } else {
          await updateDoc(tutoriaRef, {
            estado: 'REQUIERE_ADMIN',
            correoTutor: 'POR_ASIGNAR', 
            reasignada_automaticamente: true,
            notas_admin: 'No se encontró un tutor de reemplazo automático.'
          });
          if (tutoria.correoEstudiante) {
            await this.dbService.crearNotificacion({
              titulo: '⚠️ Tutoría en Revisión por Coordinación',
              mensaje: `Tu tutor anterior canceló la sesión de ${tutoria.materia}. Coordinación te asignará un reemplazo pronto.`,
              tipo: 'TUTORIA',
              correo_destino: tutoria.correoEstudiante,
              rol_destino: 'ESTUDIANTE'
            });
          }
          this.mostrarAviso('No hay reemplazo automático disponible. Se ha enviado al Administrador.', 'advertencia');
        }
      }
    } catch (error) {
      console.error('Error procesando cancelación:', error);
      this.mostrarAviso('Ocurrió un error al procesar la cancelación.', 'error');
    }
  }

  async buscarTutorReemplazo(materia: string, dia: string, hora: string, correoCancelador: string) {
    const q = query(collection(this.firestore, 'Tutores'), where('estado', '==', 'ACTIVO'));
    const snapshot = await getDocs(q);
    
    let candidatosValidos: any[] = []; 
    const correoCanceladorLimpio = String(correoCancelador || '').toLowerCase().trim();

    snapshot.forEach(docSnap => {
      const tutor = docSnap.data() as any;
      const correoTutorLimpio = String(tutor.correo || tutor.correo_google || '').toLowerCase().trim();

      if (correoTutorLimpio !== correoCanceladorLimpio) {
        const enseñaMateria = tutor.materias && tutor.materias.includes(materia);
        const claveHorario = `${dia}-${hora}`;
        const tieneHorario = tutor.horarios && tutor.horarios[claveHorario];

        if (enseñaMateria && tieneHorario) {
          candidatosValidos.push(tutor); 
        }
      }
    });

    if (candidatosValidos.length > 0) {
      const indiceAlAzar = Math.floor(Math.random() * candidatosValidos.length);
      return candidatosValidos[indiceAlAzar];
    }
    return null; 
  }

  abrirGuia() { this.mostrarGuiaTutor = true; }
  cerrarGuia() { this.mostrarGuiaTutor = false; }

  async mostrarAviso(mensaje: string, tipo: 'exito' | 'error' | 'advertencia' | 'info' = 'exito') {
    let icono = 'checkmark-circle-outline';
    let claseCss = 'toast-exito';

    if (tipo === 'error') { icono = 'close-circle-outline'; claseCss = 'toast-error'; } 
    else if (tipo === 'advertencia') { icono = 'warning-outline'; claseCss = 'toast-advertencia'; } 
    else if (tipo === 'info') { icono = 'information-circle-outline'; claseCss = 'toast-info'; }

    const toast = await this.toastController.create({
      message: mensaje, duration: 3000, position: 'top', icon: icono, cssClass: `toast-premium-gietaes ${claseCss}`, mode: 'ios' 
    });
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

  // ==========================================
  // RENOVACIÓN TUTOR (WIZARD)
  // ==========================================
  async confirmarRenovacionTutor() {
    try {
      const tutorRef = doc(this.firestore, 'Tutores', this.tutorDocId);

      if (this.decisionTutor === 'NO') {
        await deleteDoc(tutorRef); 
        this.mostrarModalRenovacionTutor = false;
        this.mostrarAviso('Tu perfil de tutor ha sido eliminado. ¡Gracias por tu servicio!', 'info');
        this.irAPanel('/tabs/horarios', 'ESTUDIANTE'); 
        return;
      }

      if (!this.permanenciaTutor || this.materiasSeleccionadas.length === 0 || Object.keys(this.horarioSeleccionado).length === 0) {
        this.mostrarAviso('Por favor, completa tu permanencia, elige materias y selecciona tus horarios en el calendario.', 'advertencia');
        return;
      }

      await updateDoc(tutorRef, {
        ciclo: this.nuevoCicloTutor,
        permanencia: this.permanenciaTutor,
        materias: this.materiasSeleccionadas,
        horarios: this.horarioSeleccionado,
        ultimo_periodo_activo: this.periodoApp
      });

      if (this.datosTutorActual) {
        const horariosFormateados = this.dbService.formatearHorariosParaExcel(this.horarioSeleccionado);
        const payloadExcel = {
          opcion: 'aceptarTutorOficial',
          nombre: this.datosTutorActual['nombre'],
          cedula: this.datosTutorActual['cedula'] || '',
          ciclo: this.nuevoCicloTutor,
          carrera: this.datosTutorActual['carrera'],
          materias: this.materiasSeleccionadas.join(', '), 
          correo: this.datosTutorActual['correo'],
          celular: this.datosTutorActual['celular'] || '',
          permanencia: this.permanenciaTutor,
          horarios: horariosFormateados,
          periodo: this.periodoApp
        };
        await this.dbService.enviarAExcel(payloadExcel);
      }

      this.mostrarModalRenovacionTutor = false;
      this.mostrarAviso(`¡Renovación exitosa para el Periodo ${this.periodoApp}!`, 'exito');

    } catch (error) {
      this.mostrarAviso('Error de conexión al procesar tu renovación.', 'error');
    }
  }

  async prepararRenovacion() {
    this.horarioSeleccionado = {}; 
    try {
      const estudianteRef = doc(this.firestore, 'Estudiantes', this.correoUsuario.toLowerCase().trim());
      const estudianteSnap = await getDoc(estudianteRef);
      if (estudianteSnap.exists() && estudianteSnap.data()['ciclo']) {
        this.nuevoCicloTutor = estudianteSnap.data()['ciclo'];
      } else {
        this.nuevoCicloTutor = parseInt((localStorage.getItem('ciclo') || '1').replace(/\D/g, ''), 10) || 1;
      }
    } catch (error) {
      this.nuevoCicloTutor = 1; 
    }
    const catalogos = await this.dbService.obtenerCatalogosDesdeExcel();
    this.materiasCatalogo = catalogos.materias;
    this.filtrarMateriasDisponibles(); 
  }

  siguientePaso() {
    if (this.pasoActual === 1) {
      if (!this.decisionTutor) {
        this.mostrarAviso('Por favor, selecciona una opción.', 'advertencia');
        return;
      }
      if (this.decisionTutor === 'NO') {
        this.confirmarRenovacionTutor();
        return;
      }
      this.pasoActual++;
    } 
    else if (this.pasoActual === 2) {
      if (!this.permanenciaTutor) {
        this.mostrarAviso('Selecciona tu tiempo como tutor.', 'advertencia');
        return;
      }
      this.filtrarMateriasDisponibles();
      this.pasoActual++;
    } 
    else if (this.pasoActual === 3) {
      if (this.materiasSeleccionadas.length === 0) {
        this.mostrarAviso('Selecciona al menos una materia.', 'advertencia');
        return;
      }
      this.pasoActual++;
    }
  }

  filtrarMateriasDisponibles() {
    if (!this.datosTutorActual || this.materiasCatalogo.length === 0) return;
    this.materiasDisponibles = this.materiasCatalogo
      .filter(m => m.carrera === this.datosTutorActual['carrera'] && m.ciclo < this.nuevoCicloTutor)
      .map(m => m.nombre);
    this.materiasSeleccionadas = []; 
  }

  abrirRenovacion() {
    this.pasoActual = 1;
    this.decisionTutor = '';
    this.mostrarModalRenovacionTutor = true;
    this.prepararRenovacion();
  }

  pasoAnterior() {
    if (this.pasoActual > 1) {
      this.pasoActual--;
    }
  }

  seleccionarDecision(decision: string) { this.decisionTutor = decision; }
  seleccionarCiclo(ciclo: number) { this.nuevoCicloTutor = ciclo; }
  seleccionarPermanencia(perm: string) { this.permanenciaTutor = perm; }
  seleccionarModalidadGlobal(mod: string) { this.modalidadGlobal = mod; }

  toggleMateriaSeleccionada(materia: string) {
    const index = this.materiasSeleccionadas.indexOf(materia);
    if (index > -1) {
      this.materiasSeleccionadas.splice(index, 1);
    } else {
      this.materiasSeleccionadas.push(materia);
    }
  }

  esBloqueDeshabilitado(dia: string, franja: string): boolean {
    const diaLimpio = dia.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (diaLimpio === 'sabado') {
      const horaStr = franja.split(':')[0].trim();
      const horaInicio = parseInt(horaStr, 10);
      if (horaInicio >= 13) {
        return true;
      }
    }
    return false;
  }

  seleccionarBloque(dia: string, franja: string) {
    if (this.esBloqueDeshabilitado(dia, franja)) {
      this.mostrarAviso('Los sábados solo se permiten tutorías hasta las 13:00.', 'advertencia');
      return;
    }
    const clave = `${dia}-${franja}`;
    const diaLimpio = dia.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (this.horarioSeleccionado[clave]) {
      delete this.horarioSeleccionado[clave]; 
    } else {
      if (diaLimpio === 'sabado') {
        this.horarioSeleccionado[clave] = 'VIRTUAL';
      } else {
        this.horarioSeleccionado[clave] = this.modalidadGlobal; 
      }
    }
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

  irAPanel(ruta: string, rolDestino: string) {
    this.menuRolAbierto = false; 
    localStorage.setItem('rol', rolDestino); 
    setTimeout(() => { this.router.navigate([ruta]); }, 150); 
  }

  irAPerfil() {
    this.menuPerfilAbierto = false;
    this.router.navigate(['/tabs-tutor/perfil']); 
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
}