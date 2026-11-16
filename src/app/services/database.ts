import { Injectable, inject } from '@angular/core';
import { 
  Firestore, collection, addDoc, query, where, 
  getDocs, doc, setDoc, collectionData, getDoc, updateDoc, writeBatch
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Storage } from '@angular/fire/storage';

export interface MateriaCatalogo {
  sede: string;
  carrera: string;
  ciclo: number;
  nombre: string;
}

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {
  materiasMaster: MateriaCatalogo[] = [];
  public firestore = inject(Firestore);
  public storage = inject(Storage);

  scriptURL_dinamica: string = '';
  periodo_actual: string = '';

  async cargarConfiguracionGlobal(forzarActualizacion: boolean = false) {
    if (this.scriptURL_dinamica && !forzarActualizacion) return; 

    try {
      const docRef = doc(this.firestore, 'Configuracion', 'General');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        this.scriptURL_dinamica = docSnap.data()['url_google_script'];
        this.periodo_actual = docSnap.data()['periodo_actual'];
        console.log(`[SISTEMA] Conectado al Periodo: ${this.periodo_actual}`);
      }
    } catch (error) {
      console.error("Error crítico al cargar configuración global:", error);
    }
  }

  formatearHorariosParaExcel(horariosFusionados: any): any {
    let horariosExcel: any = { LUNES: '', MARTES: '', MIERCOLES: '', JUEVES: '', VIERNES: '', SABADO: '' };
    if (horariosFusionados) {
      for (let clave in horariosFusionados) {
        let [dia, hora] = clave.split('-');
        let modalidad = horariosFusionados[clave];
        let etiqueta = modalidad === 'VIRTUAL' ? '(V)' : modalidad === 'AMBAS' ? '(P)(V)' : '(P)';
        let diaClave = dia.toUpperCase().replace('É', 'E').replace('Á', 'A');
        
        if (horariosExcel[diaClave] !== undefined) {
          horariosExcel[diaClave] += `${hora.trim()} ${etiqueta}\n`;
        }
      }
    }
    return horariosExcel;
  }

  async obtenerCatalogosDesdeExcel(): Promise<{carreras: string[], materias: MateriaCatalogo[]}> {
    try {
      await this.cargarConfiguracionGlobal(); 
      if (!this.scriptURL_dinamica) return { carreras: [], materias: [] };

      let urlLimpia = this.scriptURL_dinamica.split('?')[0]; 
      const url = `${urlLimpia}?api=true`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      this.materiasMaster = []; 
      let carrerasUnicas: Set<string> = new Set();

      if (data.mallas && Array.isArray(data.mallas)) {
        data.mallas.forEach((fila: any) => {
          if (fila.SEDE && fila.CARRERA && fila.MATERIA && fila.CICLO) {
            const nuevaMateria: MateriaCatalogo = {
              sede: fila.SEDE.toString().trim().toUpperCase(),
              carrera: fila.CARRERA.toString().trim().toUpperCase(),
              ciclo: parseInt(fila.CICLO, 10), 
              nombre: fila.MATERIA.toString().trim().toUpperCase()
            };
            this.materiasMaster.push(nuevaMateria);
            carrerasUnicas.add(nuevaMateria.carrera); 
          }
        });
      }
      
      return { carreras: Array.from(carrerasUnicas).sort(), materias: this.materiasMaster };
    } catch (error) {
      console.error("[DEBUG GIETAES] Error crítico al obtener catálogos:", error);
      return { carreras: [], materias: [] };
    }
  }

  obtenerMateriasMaestras(): MateriaCatalogo[] {
    return this.materiasMaster;
  }

  async guardarPostulacion(datosPostulacion: any): Promise<boolean> {
    try {
      const postulacionesRef = collection(this.firestore, 'Postulaciones');
      await this.cargarConfiguracionGlobal();
      const paqueteFinal = { ...datosPostulacion, periodo: this.periodo_actual };
      await addDoc(postulacionesRef, paqueteFinal);

      let urlLimpia = this.scriptURL_dinamica.split('?')[0];
      await fetch(urlLimpia, {
        method: 'POST',
        mode: 'no-cors', 
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(paqueteFinal)
      });
      return true;
    } catch (error) {
      console.error("Error al guardar la postulación:", error);
      throw error;
    }
  }

  async obtenerTutoresFiltrados(sede: string, carrera: string) {
    try {
      const q = query(
        collection(this.firestore, 'Tutores'),
        where('sede', '==', sede.toUpperCase()),
        where('carrera', '==', carrera),
        where('estado', '==', 'ACTIVO')
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
    } catch (error) {
      console.error("Error al obtener el motor de tutores:", error);
      return [];
    }
  }

  async verificarSiEsAdmin(correo: string): Promise<boolean> {
    try {
      const correoLimpio = correo.toLowerCase().trim();
      const q = query(collection(this.firestore, 'Administradores'), where('correo_google', '==', correoLimpio));
      const snapshot = await getDocs(q);
      return !snapshot.empty; 
    } catch (error) {
      return false;
    }
  }

  async verificarUsuarioExistente(correoGoogle: string) {
    const correoLimpio = correoGoogle.toLowerCase().trim();
    
    try {
      let existe = false;
      let superPerfil: any = {};
      let rolMaximo = 'ESTUDIANTE';

      const qEst = query(collection(this.firestore, 'Estudiantes'), where('correo_google', '==', correoLimpio));
      const estSnap = await getDocs(qEst);
      if (!estSnap.empty) {
        existe = true;
        superPerfil = { ...estSnap.docs[0].data() };
        rolMaximo = superPerfil['rol'] || 'ESTUDIANTE';
      }

      const qTut = query(collection(this.firestore, 'Tutores'), where('correo_google', '==', correoLimpio));
      const tutSnap = await getDocs(qTut);
      if (!tutSnap.empty) {
        existe = true;
        superPerfil = { ...superPerfil, ...tutSnap.docs[0].data() };
        rolMaximo = tutSnap.docs[0].data()['rol'] || 'TUTOR'; 
      }
      
      const qAdmin = query(collection(this.firestore, 'Administradores'), where('correo_google', '==', correoLimpio));
      const adminSnap = await getDocs(qAdmin);
      if (!adminSnap.empty) {
        existe = true;
        superPerfil = { ...superPerfil, ...adminSnap.docs[0].data() };
        rolMaximo = 'ADMIN'; 
      }

      if (existe) {
        return { existe: true, rol: rolMaximo, datos: superPerfil };
      }
      return { existe: false }; 
      
    } catch (error) {
      return { existe: false, error: 'Error de conexión con la base de datos' };
    }
  }

  async registrarNuevoEstudiante(datos: any) {
    try {
      await this.cargarConfiguracionGlobal();

      const datosCompletos = {
        ...datos,
        ultimo_periodo_activo: this.periodo_actual
      };
      
      const docRef = doc(this.firestore, 'Estudiantes', datos.correo);
      await setDoc(docRef, datosCompletos);

      if (this.scriptURL_dinamica) {
        await fetch(this.scriptURL_dinamica, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            opcion: 'registrarEstudiante',
            periodo: this.periodo_actual, 
            ...datos
          })
        });
      }
    } catch (error) {
      console.error("Error al registrar estudiante:", error);
    }
  }

  async enviarPostulacion(paquete: any) {
    const nuevaRef = doc(collection(this.firestore, 'Postulaciones'));
    await this.cargarConfiguracionGlobal();
    const paqueteFinal = { ...paquete, periodo: this.periodo_actual };
    await setDoc(nuevaRef, paqueteFinal);
  }

  async aceptarTutor(idPostulacion: string, datosPostulacion: any) {
    try {
      const correoID = datosPostulacion.correo.toLowerCase().trim();
      const postulacionRef = doc(this.firestore, 'Postulaciones', idPostulacion);
      await updateDoc(postulacionRef, { estado_aprobacion: 'ACEPTADO' });

      const tutorRef = doc(this.firestore, 'Tutores', correoID);
      const tutorSnap = await getDoc(tutorRef);

      let listaMaterias: string[] = [];
      let horariosFusionados: any = {};
      
      await this.cargarConfiguracionGlobal(); 

      if (tutorSnap.exists()) {
        const datosPrevios = tutorSnap.data();
        listaMaterias = datosPrevios['materias'] || [];
        horariosFusionados = datosPrevios['horarios'] || {}; 
        
        if (!listaMaterias.includes(datosPostulacion.materia_postulada)) {
          listaMaterias.push(datosPostulacion.materia_postulada);
        }

        if (datosPostulacion.disponibilidad_horaria) {
          for (let clave in datosPostulacion.disponibilidad_horaria) {
            horariosFusionados[clave] = datosPostulacion.disponibilidad_horaria[clave];
          }
        }

        await updateDoc(tutorRef, { 
          materias: listaMaterias,
          horarios: horariosFusionados,
          ultimo_periodo_activo: this.periodo_actual 
        });

      } else {
        listaMaterias = [datosPostulacion.materia_postulada];
        horariosFusionados = datosPostulacion.disponibilidad_horaria || {};

        const nuevoTutor = {
          nombre: datosPostulacion.nombre,
          cedula: datosPostulacion.cedula || '',
          ciclo: datosPostulacion.ciclo,
          permanencia: datosPostulacion.permanencia || 'Soy nuevo',
          carrera: datosPostulacion.carrera,
          sede: datosPostulacion.sede || 'CUENCA', 
          correo_google: correoID, 
          celular: datosPostulacion.celular || '',
          correo: correoID, 
          materias: listaMaterias, 
          horarios: horariosFusionados, 
          estado: 'ACTIVO',
          rol: 'TUTOR',
          ultimo_periodo_activo: this.periodo_actual 
        };
        await setDoc(tutorRef, nuevoTutor);
      }

      let horariosExcel: any = { LUNES: '', MARTES: '', MIERCOLES: '', JUEVES: '', VIERNES: '', SABADO: '' };
      if (horariosFusionados) {
        for (let clave in horariosFusionados) {
          let [dia, hora] = clave.split('-');
          let modalidad = horariosFusionados[clave];
          let etiqueta = '(P)';
          if (modalidad === 'VIRTUAL') etiqueta = '(V)';
          if (modalidad === 'AMBAS') etiqueta = '(P)(V)';
          let diaClave = dia.toUpperCase().replace('É', 'E').replace('Á', 'A');
          
          if (horariosExcel[diaClave] !== undefined) {
            horariosExcel[diaClave] += `${hora.trim()} ${etiqueta}\n`;
          }
        }
      }

      const payloadExcel = {
        opcion: 'aceptarTutorOficial', 
        nombre: datosPostulacion.nombre,
        cedula: datosPostulacion.cedula || '',
        ciclo: datosPostulacion.ciclo,
        carrera: datosPostulacion.carrera,
        materias: listaMaterias.join(', '), 
        correo: correoID,
        celular: datosPostulacion.celular || '',
        permanencia: datosPostulacion.permanencia || 'Soy nuevo',
        horarios: horariosExcel,
        periodo: this.periodo_actual
      };

      await this.enviarAExcel(payloadExcel);

    } catch (error) {
      console.error("Error crítico en aceptarTutor:", error);
      throw error;
    }
  }

  async verificarEstadoPostulacion(correo: string): Promise<string> {
    try {
      const postQ = query(collection(this.firestore, 'Postulaciones'), where('correo', '==', correo));
      const postSnap = await getDocs(postQ);
      
      if (!postSnap.empty) {
        const hayPendientes = postSnap.docs.some(doc => doc.data()['estado_aprobacion'] === 'PENDIENTE');
        if (hayPendientes) return 'PENDIENTE';
        
        const hayAceptadas = postSnap.docs.some(doc => doc.data()['estado_aprobacion'] === 'ACEPTADO');
        if (hayAceptadas) return 'TUTOR';
        
        const todasRechazadas = postSnap.docs.every(doc => doc.data()['estado_aprobacion'] === 'RECHAZADO');
        if (todasRechazadas) return 'RECHAZADO';
      }
      return 'NINGUNA';
    } catch (e) {
      return 'NINGUNA';
    }
  }

  async obtenerTutoresActivos() {
    try {
      const q = query(collection(this.firestore, 'Tutores'), where('estado', '==', 'ACTIVO'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      return [];
    }
  }

  async obtenerCoordinadoresDesdeExcel(): Promise<any[]> {
    try {
      await this.cargarConfiguracionGlobal(); 
      if (!this.scriptURL_dinamica) return [];

      let urlLimpia = this.scriptURL_dinamica.split('?')[0]; 
      const url = `${urlLimpia}?api=coordinadores`; 
      const respuesta = await fetch(url);
      const texto = await respuesta.text(); 
      try {
        return JSON.parse(texto);
      } catch (jsonError) {
        return [];
      }
    } catch (error) {
      return []; 
    }
  }

  async enviarAExcel(paqueteCompleto: any) {
    try {
      await this.cargarConfiguracionGlobal();
      let urlLimpia = this.scriptURL_dinamica.split('?')[0]; 
      await fetch(urlLimpia, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(paqueteCompleto)
      });
    } catch (error) {
      console.error('Error puenteando a Excel', error);
    }
  }

  async guardarEstudiante(uid: string, datos: any) {
    const userRef = doc(this.firestore, `Estudiantes/${uid}`);
    return setDoc(userRef, datos, { merge: true });
  }

  obtenerHorarios(): Observable<any[]> {
    const horariosRef = collection(this.firestore, 'HorariosDisponibles');
    return collectionData(horariosRef, { idField: 'id' });
  } 

  generarCodigoTutoria(materia: string): string {
    const materiaLimpia = materia.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const siglas = materiaLimpia.substring(0, 3).toUpperCase();
    const numeros = Math.floor(1000 + Math.random() * 9000); 
    return `${siglas}-${numeros}`;
  }

  // 🌟 PUNTO #18: Trazabilidad completa al agendar (fecha_agendamiento, fecha_modificacion_tutor, fecha_impartida)
  async agendarTutoria(datosReserva: any) {
    await this.cargarConfiguracionGlobal();
    const reservasRef = collection(this.firestore, 'Reservas');
    const ahoraISO = new Date().toISOString();

    const nuevaReserva = {
      ...datosReserva,
      correoEstudiante: String(datosReserva.correoEstudiante || '').toLowerCase().trim(),
      correoTutor: String(datosReserva.correoTutor || '').toLowerCase().trim(),
      codigo: datosReserva.codigo || this.generarCodigoTutoria(datosReserva.materia),
      estado: datosReserva.estado || 'PENDIENTE',
      tipo_flujo: datosReserva.tipo_flujo || 'CONSULTA', // Soporta Punto #5 (CONSULTA vs PROCESO)
      fecha_solicitud: ahoraISO,
      fecha_agendamiento: datosReserva.fecha_agendamiento || ahoraISO,
      fecha_modificacion_tutor: datosReserva.fecha_modificacion_tutor || null,
      fecha_impartida: datosReserva.fecha_impartida || null,
      periodo: this.periodo_actual
    };

    const docRef = await addDoc(reservasRef, nuevaReserva);

    try {
      await addDoc(collection(this.firestore, 'Tutorias_Agendadas'), nuevaReserva);
    } catch (e) {
      console.warn('No se pudo respaldar en Tutorias_Agendadas:', e);
    }

    return docRef;
  }

  // 🌟 PUNTOS #18, #6 y #11: Reprogramar fecha/hora desde el panel del tutor + traza + notificación
  async reprogramarReservaTutor(
    idReservaMaestra: string,
    codigoTutoria: string,
    nuevosDatos: {
      dia_elegido: string;
      hora_elegida: string;
      fecha_exacta: string;
      motivo?: string;
    }
  ) {
    const ahoraISO = new Date().toISOString();
    const actualizacion = {
      dia_elegido: nuevosDatos.dia_elegido,
      hora_elegida: nuevosDatos.hora_elegida,
      fecha_exacta: nuevosDatos.fecha_exacta,
      fecha_modificacion_tutor: ahoraISO,
      estado: 'ACEPTADA'
    };

    // 1. Actualizamos todas las reservas asociadas al código (maestra + invitados) o solo la maestra si no hay código
    let reservasAfectadas: any[] = [];
    if (codigoTutoria && codigoTutoria !== 'SIN CÓDIGO') {
      const qGrupo = query(collection(this.firestore, 'Reservas'), where('codigo', '==', codigoTutoria));
      const snapGrupo = await getDocs(qGrupo);
      const promesas = snapGrupo.docs.map(d => {
        reservasAfectadas.push({ id: d.id, ...d.data() });
        return updateDoc(doc(this.firestore, 'Reservas', d.id), actualizacion);
      });
      await Promise.all(promesas);
    } else {
      const refMaestra = doc(this.firestore, 'Reservas', idReservaMaestra);
      const snapMaestra = await getDoc(refMaestra);
      if (snapMaestra.exists()) {
        reservasAfectadas.push({ id: snapMaestra.id, ...snapMaestra.data() });
      }
      await updateDoc(refMaestra, actualizacion);
    }

    // 2. Notificamos automáticamente a todos los estudiantes afectados (Punto #6 y #11)
    const promesasNotif = reservasAfectadas.map(res => {
      if (!res.correoEstudiante) return Promise.resolve();
      const detalleMotivo = nuevosDatos.motivo ? ` Motivo: ${nuevosDatos.motivo}.` : '';
      return this.crearNotificacion({
        titulo: '📅 Tutoría Reprogramada',
        mensaje: `El tutor ${res.nombreTutor || ''} reprogramó tu tutoría de ${res.materia} para el ${nuevosDatos.dia_elegido} (${nuevosDatos.fecha_exacta}) a las ${nuevosDatos.hora_elegida}.${detalleMotivo}`,
        tipo: 'REPROGRAMACION',
        correo_destino: res.correoEstudiante.toLowerCase().trim(),
        rol_destino: 'ESTUDIANTE'
      });
    });

    await Promise.all(promesasNotif);
    return ahoraISO;
  }
  
  async obtenerMisTutorias(correo: string, rol: string) {
    try {
      const correoLimpio = correo.toLowerCase().trim();
      
      const qTutor = query(collection(this.firestore, 'Reservas'), where('correoTutor', '==', correoLimpio));
      const qEstudiante = query(collection(this.firestore, 'Reservas'), where('correoEstudiante', '==', correoLimpio));
      
      const [snapTutor, snapEstudiante] = await Promise.all([getDocs(qTutor), getDocs(qEstudiante)]);
      
      const todosLosDocs = [...snapTutor.docs, ...snapEstudiante.docs];
      return todosLosDocs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
      return [];
    }
  }

  async obtenerRolUsuario(correo: string): Promise<string> {
    try {
      const correoID = correo.toLowerCase().trim();

      const adminDoc = await getDoc(doc(this.firestore, 'Administradores', correoID));
      if (adminDoc.exists()) return 'ADMIN';

      const qAdminGoogle = query(collection(this.firestore, 'Administradores'), where('correo_google', '==', correoID));
      const snapAdminGoogle = await getDocs(qAdminGoogle);
      if (!snapAdminGoogle.empty) return 'ADMIN';

      const qAdminCorreo = query(collection(this.firestore, 'Administradores'), where('correo', '==', correoID));
      const snapAdminCorreo = await getDocs(qAdminCorreo);
      if (!snapAdminCorreo.empty) return 'ADMIN';

      const tutorDoc = await getDoc(doc(this.firestore, 'Tutores', correoID));
      if (tutorDoc.exists()) return 'TUTOR';

      const qTutorGoogle = query(collection(this.firestore, 'Tutores'), where('correo_google', '==', correoID));
      const snapTutorGoogle = await getDocs(qTutorGoogle);
      if (!snapTutorGoogle.empty) return 'TUTOR';

      const qTutorCorreo = query(collection(this.firestore, 'Tutores'), where('correo', '==', correoID));
      const snapTutorCorreo = await getDocs(qTutorCorreo);
      if (!snapTutorCorreo.empty) return 'TUTOR';

      return 'ESTUDIANTE';
    } catch (error) {
      console.error('Error obteniendo rol:', error);
      return 'ESTUDIANTE';
    }
  }

  async obtenerPermisosPaneles(correo: string): Promise<{ tienePanelTutor: boolean; tienePanelAdmin: boolean }> {
    const rolGuardado = (localStorage.getItem('rol') || '').toUpperCase().trim();
    let tienePanelAdmin = rolGuardado === 'ADMIN' || rolGuardado === 'COORDINADOR';
    let tienePanelTutor = tienePanelAdmin || rolGuardado === 'TUTOR';

    if (!correo) {
      return { tienePanelTutor, tienePanelAdmin };
    }

    const correoLimpio = correo.toLowerCase().trim();

    try {
      const adminDoc = await getDoc(doc(this.firestore, 'Administradores', correoLimpio));
      const snapAdmin = await getDocs(query(collection(this.firestore, 'Administradores'), where('correo', '==', correoLimpio)));
      if (adminDoc.exists() || !snapAdmin.empty) {
        tienePanelAdmin = true;
        tienePanelTutor = true;
      }

      if (!tienePanelTutor) {
        const tutorDoc = await getDoc(doc(this.firestore, 'Tutores', correoLimpio));
        const snapTut = await getDocs(query(collection(this.firestore, 'Tutores'), where('correo', '==', correoLimpio)));
        if (tutorDoc.exists() || !snapTut.empty) {
          tienePanelTutor = true;
        }
      }

      const estDoc = await getDoc(doc(this.firestore, 'Estudiantes', correoLimpio));
      if (estDoc.exists()) {
        const rolDB = String(estDoc.data()['rol'] || estDoc.data()['Rol'] || '').toUpperCase().trim();
        if (rolDB === 'TUTOR') tienePanelTutor = true;
        if (rolDB === 'COORDINADOR' || rolDB === 'ADMIN') {
          tienePanelTutor = true;
          tienePanelAdmin = true;
        }
      }

      localStorage.setItem('tienePanelTutor', tienePanelTutor ? 'true' : 'false');
      localStorage.setItem('tienePanelAdmin', tienePanelAdmin ? 'true' : 'false');
    } catch (error) {
      console.error('Error verificando permisos de paneles:', error);
    }

    return { tienePanelTutor, tienePanelAdmin };
  }

  async unirseATutoriaPorCodigo(
    codigoIngresado: string,
    correoUsuario: string,
    nombreUsuario: string,
    sedeEstudiante: string = '',
    docenteEstudiante: string = ''
  ) {
    try {
      const codigoLimpio = codigoIngresado.toUpperCase().trim();
      const correoLimpio = correoUsuario.toLowerCase().trim();

      const qBusqueda = query(collection(this.firestore, 'Reservas'), where('codigo', '==', codigoLimpio));
      const snapshot = await getDocs(qBusqueda);

      if (snapshot.empty) {
        return { exito: false, mensaje: 'El código ingresado no existe o es incorrecto.' };
      }

      const docMaestro = snapshot.docs.find(d => !d.data()['esInvitado']) || snapshot.docs[0];
      const tutoriaOriginal = docMaestro.data();

      const estadoOriginal = String(tutoriaOriginal['estado'] || '').toUpperCase().trim();
      if (estadoOriginal === 'CANCELADA' || estadoOriginal === 'RECHAZADA') {
        return { exito: false, mensaje: 'Esta tutoría ya fue cancelada o rechazada.' };
      }

      const yaEstaEnTutoria = snapshot.docs.some(
        d => String(d.data()['correoEstudiante'] || '').toLowerCase().trim() === correoLimpio
      );
      if (yaEstaEnTutoria) {
        return { exito: false, mensaje: 'Ya estás registrado en esta tutoría.' };
      }

      const correoTutorOriginal = String(tutoriaOriginal['correoTutor'] || '').toLowerCase().trim();
      if (correoTutorOriginal === correoLimpio) {
        return { exito: false, mensaje: 'No puedes unirte como estudiante a tu propia tutoría.' };
      }

      let celularAlumno = localStorage.getItem('celular') || 'Desconocido';
      let codigoPaisAlumno = localStorage.getItem('codigo_pais') || '+593';
      let sedeAlumno = (sedeEstudiante || localStorage.getItem('sede') || '').toUpperCase().trim();

      const estSnap = await getDoc(doc(this.firestore, 'Estudiantes', correoLimpio));
      if (estSnap.exists()) {
        const estData = estSnap.data();
        if (estData['celular']) celularAlumno = estData['celular'];
        if (estData['codigo_pais']) codigoPaisAlumno = estData['codigo_pais'];
        if (!sedeAlumno && estData['sede']) sedeAlumno = String(estData['sede']).toUpperCase().trim();
      } else {
        const tutSnap = await getDoc(doc(this.firestore, 'Tutores', correoLimpio));
        if (tutSnap.exists()) {
          const tutData = tutSnap.data();
          if (tutData['celular']) celularAlumno = tutData['celular'];
          if (tutData['codigo_pais']) codigoPaisAlumno = tutData['codigo_pais'];
          if (!sedeAlumno && tutData['sede']) sedeAlumno = String(tutData['sede']).toUpperCase().trim();
        }
      }

      let sedeTutoria = String(tutoriaOriginal['sedeTutor'] || tutoriaOriginal['sede'] || '').toUpperCase().trim();
      if (!sedeTutoria && correoTutorOriginal) {
        const tutorDoc = await getDoc(doc(this.firestore, 'Tutores', correoTutorOriginal));
        if (tutorDoc.exists() && tutorDoc.data()['sede']) {
          sedeTutoria = String(tutorDoc.data()['sede']).toUpperCase().trim();
        } else {
          const qTutor = query(collection(this.firestore, 'Tutores'), where('correo', '==', correoTutorOriginal));
          const snapTutor = await getDocs(qTutor);
          if (!snapTutor.empty && snapTutor.docs[0].data()['sede']) {
            sedeTutoria = String(snapTutor.docs[0].data()['sede']).toUpperCase().trim();
          }
        }
      }

      const modalidadTutoria = String(tutoriaOriginal['modalidad'] || 'PRESENCIAL').toUpperCase().trim();

      if (modalidadTutoria === 'PRESENCIAL' && sedeTutoria && sedeAlumno && sedeTutoria !== sedeAlumno) {
        return {
          exito: false,
          mensaje: `No puedes unirte: esta tutoría es PRESENCIAL en la sede ${sedeTutoria} y tu sede registrada es ${sedeAlumno}.`
        };
      }

      const ahoraISO = new Date().toISOString();
      const nuevaReserva = {
        correoEstudiante: correoLimpio,
        nombreEstudiante: nombreUsuario,
        celularEstudiante: celularAlumno,
        codigoPaisEstudiante: codigoPaisAlumno,
        correoTutor: tutoriaOriginal['correoTutor'],
        nombreTutor: tutoriaOriginal['nombreTutor'],
        celularTutor: tutoriaOriginal['celularTutor'],
        codigoPaisTutor: tutoriaOriginal['codigoPaisTutor'] || '+593',
        materia: tutoriaOriginal['materia'],
        dia_elegido: tutoriaOriginal['dia_elegido'],
        hora_elegida: tutoriaOriginal['hora_elegida'],
        duracion_horas: tutoriaOriginal['duracion_horas'] || 1,
        fecha_exacta: tutoriaOriginal['fecha_exacta'] || '',
        modalidad: tutoriaOriginal['modalidad'] || 'PRESENCIAL',
        sedeTutor: sedeTutoria,
        tipo_tutoria: tutoriaOriginal['tipo_tutoria'] || 'GRUPAL',
        tipo_derivacion: tutoriaOriginal['tipo_derivacion'] || 'DECISIÓN PROPIA',
        docente: docenteEstudiante || tutoriaOriginal['docente'] || 'No especificado',
        codigo: codigoLimpio,
        estado: tutoriaOriginal['estado'],
        tipo_flujo: tutoriaOriginal['tipo_flujo'] || 'CONSULTA',
        esInvitado: true,
        fecha_solicitud: ahoraISO,
        fecha_agendamiento: tutoriaOriginal['fecha_agendamiento'] || tutoriaOriginal['fecha_solicitud'] || ahoraISO,
        fecha_modificacion_tutor: tutoriaOriginal['fecha_modificacion_tutor'] || null,
        fecha_impartida: null,
        periodo: tutoriaOriginal['periodo'] || this.periodo_actual
      };

      await addDoc(collection(this.firestore, 'Reservas'), nuevaReserva);
      return { exito: true, mensaje: `¡Te has unido a la tutoría de ${tutoriaOriginal['materia']} con éxito!` };
    } catch (error) {
      console.error('Error al unirse por código:', error);
      return { exito: false, mensaje: 'Ocurrió un error en el servidor.' };
    }
  }

  async verificarPostulacionPendiente(correo: string): Promise<boolean> {
    try {
      const q = query(
        collection(this.firestore, 'Postulaciones'),
        where('correo', '==', correo),
        where('estado_aprobacion', '==', 'PENDIENTE')
      );
      const querySnapshot = await getDocs(q);
      return !querySnapshot.empty; 
    } catch (error) {
      return false;
    }
  }

  async rechazarPostulacion(idPostulacion: string): Promise<void> {
    try {
      const postRef = doc(this.firestore, 'Postulaciones', idPostulacion);
      await updateDoc(postRef, { estado_aprobacion: 'RECHAZADO' });
    } catch (error) {
      throw error;
    }
  }

  async crearNotificacion(datos: any) {
    try {
      const notificacionRef = doc(collection(this.firestore, 'Notificaciones'));
      await setDoc(notificacionRef, {
        titulo: datos.titulo,
        mensaje: datos.mensaje,
        tipo: datos.tipo,
        correo_destino: String(datos.correo_destino || '').toLowerCase().trim(),
        sede_destino: datos.sede_destino || 'GLOBAL',
        rol_destino: datos.rol_destino || 'ESTUDIANTE', 
        fecha: new Date().toISOString(),
        leida_por: [] 
      });
    } catch (error) {
      console.error("Error al crear notificación:", error);
    }
  }

  async obtenerNotificacionesUsuario(correo: string, rol: string, sede: string, contextoPanel: string = 'ESTUDIANTE') {
    try {
      const correoLimpio = String(correo || '').toLowerCase().trim();
      const q = query(
        collection(this.firestore, 'Notificaciones'),
        where('correo_destino', '==', correoLimpio),
        where('rol_destino', '==', contextoPanel)
      );
      
      const querySnapshot = await getDocs(q);
      let notificaciones: any[] = [];
      querySnapshot.forEach((doc) => {
        notificaciones.push({ id: doc.id, ...doc.data() });
      });

      return notificaciones.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    } catch (error) {
      return [];
    }
  }

  async marcarNotificacionLeida(idNotificacion: string, correoUsuario: string) {
    try {
      const correoLimpio = String(correoUsuario || '').toLowerCase().trim();
      const notifRef = doc(this.firestore, 'Notificaciones', idNotificacion);
      const notifSnap = await getDoc(notifRef);

      if (notifSnap.exists()) {
        const datos = notifSnap.data();
        const leidaPor: string[] = datos['leida_por'] || [];

        if (!leidaPor.includes(correoLimpio)) {
          leidaPor.push(correoLimpio);
          await updateDoc(notifRef, { leida_por: leidaPor });
        }
      }
    } catch (error) {}
  }

  // 🌟 PUNTO #11: Marcado masivo de todas las notificaciones como leídas en un solo batch
  async marcarTodasComoLeidas(correoUsuario: string, contextoPanel: string = 'ESTUDIANTE'): Promise<number> {
    try {
      const correoLimpio = String(correoUsuario || '').toLowerCase().trim();
      const q = query(
        collection(this.firestore, 'Notificaciones'),
        where('correo_destino', '==', correoLimpio),
        where('rol_destino', '==', contextoPanel)
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) return 0;

      const batch = writeBatch(this.firestore);
      let actualizadas = 0;

      snapshot.docs.forEach(docSnap => {
        const datos = docSnap.data();
        const leidaPor: string[] = datos['leida_por'] || [];
        if (!leidaPor.includes(correoLimpio)) {
          batch.update(docSnap.ref, { leida_por: [...leidaPor, correoLimpio] });
          actualizadas++;
        }
      });

      if (actualizadas > 0) {
        await batch.commit();
      }
      return actualizadas;
    } catch (error) {
      console.error('Error en marcarTodasComoLeidas:', error);
      return 0;
    }
  }

  async obtenerEstudiantesPorCarrera(carrera: string) {
    try {
      const q = query(collection(this.firestore, 'Estudiantes'), where('carrera', '==', carrera.toUpperCase()));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      return [];
    }
  }

  // 🌟 PUNTO #18: Propaga fecha_agendamiento, fecha_modificacion_tutor y registra fecha_impartida
  async guardarAsistencia(datosAsistencia: any) {
    try {
      await this.cargarConfiguracionGlobal();
      const ahoraISO = new Date().toISOString();

      let nombreLimpio = 'ESTUDIANTE_DESCONOCIDO';
      if (datosAsistencia.estudiante_info) {
        const nombreCrudo = datosAsistencia.estudiante_info.split(' - ')[0].trim();
        nombreLimpio = nombreCrudo.replace(/\s+/g, '_'); 
      }

      const idUnico = `${nombreLimpio}_${new Date().getTime()}`;
      const nuevaRef = doc(this.firestore, 'Asistencias', idUnico);
      
      const asistenciaFinal = {
        ...datosAsistencia,
        fecha_agendamiento: datosAsistencia.fecha_agendamiento || datosAsistencia.fecha_solicitud || ahoraISO,
        fecha_modificacion_tutor: datosAsistencia.fecha_modificacion_tutor || null,
        fecha_impartida: datosAsistencia.fecha_impartida || ahoraISO,
        fecha_registro: datosAsistencia.fecha_registro || ahoraISO,
        periodo: this.periodo_actual
      };
      await setDoc(nuevaRef, asistenciaFinal);

      const payloadExcel = {
        opcion: 'registrarAsistencia',
        ...asistenciaFinal
      };

      if (this.scriptURL_dinamica) {
        await fetch(this.scriptURL_dinamica, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadExcel)
        });
      }
      
    } catch (error) {
      throw error;
    }
  }

  async obtenerDocentesDesdeExcel(sedeFiltro: string = 'GLOBAL'): Promise<string[]> {
    try {
      await this.cargarConfiguracionGlobal();
      if (!this.scriptURL_dinamica) return [];

      let urlLimpia = this.scriptURL_dinamica.split('?')[0];
      const url = `${urlLimpia}?api=true&sede=${sedeFiltro}`;
      
      const response = await fetch(url);
      const data = await response.json();
      return data.docentes || [];
    } catch (error) {
      return [];
    }
  }

  async subirPDFRendimiento(archivo: File, cedula: string): Promise<string> {
    const CLOUD_NAME = 'ostzs4f1';       
    const UPLOAD_PRESET = 's7tcq2rz'; 

    const urlCloudinary = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`;

    const formData = new FormData();
    formData.append('file', archivo);
    formData.append('upload_preset', UPLOAD_PRESET);

    try {
      const respuesta = await fetch(urlCloudinary, {
        method: 'POST',
        body: formData
      });

      const data = await respuesta.json();
      
      if (data.secure_url) {
        return data.secure_url; 
      } else {
        throw new Error('Cloudinary no devolvió la URL de descarga.');
      }
    } catch (error) {
      throw error;
    }
  }

  async guardarEvaluacionEstudiante(payloadExcel: any) {
    try {
      await fetch(this.scriptURL_dinamica, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadExcel)
      });
    } catch (error) {
      console.error('Error al enviar la evaluación al Excel:', error);
    }
  }
}