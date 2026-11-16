import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonContent, IonItem,  IonInput, 
  IonSelect, IonSelectOption, IonButton, IonSpinner, IonList, IonIcon,ToastController,AlertController 
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { logoGoogle, arrowBackOutline,checkmarkCircleOutline,warningOutline } from 'ionicons/icons'; 
import { DatabaseService } from '../../services/database';
import { Auth, GoogleAuthProvider, signInWithPopup, signOut } from '@angular/fire/auth';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore'; 

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule, IonContent, IonItem, 
     IonInput, IonSelect, IonSelectOption, 
    IonButton, IonSpinner, IonList, IonIcon
  ]
})
export class LoginPage implements OnInit {
  private dbService = inject(DatabaseService);
  private router = inject(Router);
  private auth = inject(Auth);
  private firestore = inject(Firestore); 
  private toastController = inject(ToastController);
  private alertController = inject(AlertController);

  modoRegistro = false;
  cargando = false;
  mostrarBienvenida = false;
  fraseSalesianaActual: string = '';
  private datosPendientesSesion: any = null;
  private rolPendienteSesion: string = 'ESTUDIANTE';
  
  correoGoogle: string = ''; 
  correoInstitucional: string = ''; 
  
  // 🌟 SEPARAMOS NOMBRES Y APELLIDOS
  nombres: string = '';
  apellidos: string = '';
  
  sede: string = '';       
  cedula: string = '';
  ciclo: string = '';
  beca: string = '';
  
  codigoPais: string = '+593';
  celular: string = '';

  carreraSeleccionada: string = '';
  busquedaCarrera: string = '';
  listaCarrerasMaster: string[] = [];
  carrerasFiltradas: string[] = [];

  // ==========================================
  // 🌟 GETTERS DE VALIDACIÓN EN TIEMPO REAL
  // ==========================================
  get estadoCorreo(): { texto: string, color: string } | null {
    if (!this.correoInstitucional) return null; 
    const correoLimpio = this.correoInstitucional.toLowerCase().trim();
    if (correoLimpio.endsWith('@est.ups.edu.ec') || correoLimpio.endsWith('@ups.edu.ec')) {
      return { texto: 'Correo válido', color: 'exito' };
    }
    return { texto: 'Debe terminar en @est.ups.edu.ec o @ups.edu.ec', color: 'error' };
  }

  // 🌟 VALIDACIÓN INDIVIDUAL DE NOMBRES
  get estadoNombres(): { texto: string, color: string } | null {
    if (!this.nombres) return null;
    const regex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
    if (!regex.test(this.nombres)) return { texto: 'Solo se permiten letras', color: 'error' };
    if (this.nombres.trim().split(' ').length < 1) return { texto: 'Por favor, ingrese minimo un nombre', color: 'advertencia' };
    return { texto: 'Nombres válidos', color: 'exito' };
  }

  // 🌟 VALIDACIÓN INDIVIDUAL DE APELLIDOS
  get estadoApellidos(): { texto: string, color: string } | null {
    if (!this.apellidos) return null;
    const regex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
    if (!regex.test(this.apellidos)) return { texto: 'Solo se permiten letras', color: 'error' };
    if (this.apellidos.trim().split(' ').length < 1) return { texto: 'Por favor, ingrese minimo un apellido', color: 'advertencia' };
    return { texto: 'Apellidos válidos', color: 'exito' };
  }

  get estadoCedula(): { texto: string, color: string } | null {
    if (!this.cedula) return null;
    const val = this.validarDocumento(this.cedula);
    if (val.valido) return { texto: val.mensaje, color: 'exito' };
    return { texto: val.mensaje, color: 'error' };
  }

  get estadoCelular(): { texto: string, color: string } | null {
    if (!this.celular) return null;
    
    if (this.validarCelular(this.celular, this.codigoPais)) {
      return { texto: 'Número de celular válido', color: 'exito' };
    }

    if (this.codigoPais === '+593') {
      return { texto: 'Ecuador: Debe tener 10 dígitos (Ej: 09XXXXXXXX)', color: 'error' };
    } else {
      return { texto: 'Ingrese un número válido (Mínimo 8 dígitos)', color: 'error' };
    }
  }

  get estadoCarrera(): { texto: string, color: string } | null {
    if (!this.busquedaCarrera) return null;
    if (this.carreraSeleccionada && this.carreraSeleccionada === this.busquedaCarrera) {
      return { texto: 'Carrera seleccionada correctamente', color: 'exito' };
    }
    return { texto: 'Toca una carrera de la lista desplegable', color: 'error' };
  }

  constructor() {
    addIcons({ logoGoogle, arrowBackOutline,checkmarkCircleOutline,warningOutline }); 
  }

  async ngOnInit() {
    const catalogos = await this.dbService.obtenerCatalogosDesdeExcel();
    this.listaCarrerasMaster = catalogos.carreras || [];
  }

  ionViewWillEnter() {
    this.modoRegistro = false;
    this.cargando = false;
    this.mostrarBienvenida = false;
    this.correoGoogle = '';
    this.correoInstitucional = '';
    this.nombres = '';
    this.apellidos = '';
    this.sede = '';
    this.cedula = '';
    this.carreraSeleccionada = '';
    this.busquedaCarrera = '';
    this.ciclo = '';
    this.beca = '';
    this.codigoPais = '+593'; 
    this.celular = '';
    this.carrerasFiltradas = [];
  }

  // 🌟 FORZAR MAYÚSCULAS EN TIEMPO REAL
  forzarMayusculas(campo: 'nombres' | 'apellidos') {
    if (campo === 'nombres') {
      this.nombres = this.nombres.toUpperCase();
    } else {
      this.apellidos = this.apellidos.toUpperCase();
    }
  }

  validarDocumento(docId: string): { valido: boolean, mensaje: string } {
    if (!docId) return { valido: false, mensaje: 'El documento está vacío.' };
    const docLimpio = docId.trim().toUpperCase();

    if (/^[0-9]{10}$/.test(docLimpio)) {
      if (this.validarCedulaLogica(docLimpio)) {
        return { valido: true, mensaje: 'Cédula ecuatoriana válida' };
      } else {
        return { valido: false, mensaje: 'Cédula incorrecta (no pasa validación de registro civil)' };
      }
    }

    const regexPasaporte = /^[A-Z0-9]{6,15}$/;
    if (regexPasaporte.test(docLimpio)) {
      return { valido: true, mensaje: 'Pasaporte válido' };
    }

    return { valido: false, mensaje: 'Ingrese una cédula (10 números) o pasaporte (6-15 caracteres alfanuméricos)' };
  }

  validarCedulaLogica(cedula: string): boolean {
    const provincia = parseInt(cedula.substring(0, 2), 10);
    if (provincia < 1 || (provincia > 24 && provincia !== 30)) return false;
    const tercerDigito = parseInt(cedula.substring(2, 3), 10);
    if (tercerDigito > 5) return false; 
    let suma = 0;
    for (let i = 0; i < 9; i++) {
      let digito = parseInt(cedula.charAt(i), 10);
      if (i % 2 === 0) { digito = digito * 2; if (digito > 9) digito -= 9; }
      suma += digito;
    }
    const decenaSuperior = Math.ceil(suma / 10) * 10;
    let digitoVerificador = decenaSuperior - suma;
    if (digitoVerificador === 10) digitoVerificador = 0;
    return digitoVerificador === parseInt(cedula.charAt(9), 10);
  }

  validarCelular(celular: string, codigoPais: string): boolean {
    let limpio = celular.replace(/\D/g, ''); 
    if (codigoPais === '+593') {
      return (limpio.length === 10 && limpio.startsWith('09')) || (limpio.length === 9 && limpio.startsWith('9'));
    } else {
      return limpio.length >= 8 && limpio.length <= 15;
    }
  }

  filtrarCarreras() {
    const txt = this.busquedaCarrera.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!txt) { this.carrerasFiltradas = []; return; }
    this.carrerasFiltradas = this.listaCarrerasMaster.filter(c => 
      c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(txt)
    );
  }

  seleccionarCarrera(carrera: string) {
    this.carreraSeleccionada = carrera;
    this.busquedaCarrera = carrera; 
    this.carrerasFiltradas = [];    
  }

  async ingresarConGoogle() {
    this.cargando = true;
    try {
      const proveedor = new GoogleAuthProvider();
      proveedor.setCustomParameters({ prompt: 'select_account' });
      const resultadoAuth = await signInWithPopup(this.auth, proveedor);
      const usuarioGoogle = resultadoAuth.user;
      if (!usuarioGoogle.email) {
        this.mostrarAviso("Error al leer la cuenta de Google.",'error');
        this.cargando = false; return;
      }
      this.correoGoogle = usuarioGoogle.email.toLowerCase().trim();
      const respuestaBdd = await this.dbService.verificarUsuarioExistente(this.correoGoogle);

      if (respuestaBdd.existe) {
       this.iniciarSesionLocal(respuestaBdd.datos, respuestaBdd.rol || 'ESTUDIANTE');
      } else {
        if (this.correoGoogle.endsWith('@est.ups.edu.ec') || this.correoGoogle.endsWith('@ups.edu.ec')) {
          this.correoInstitucional = this.correoGoogle;
        }
        
        // 🌟 SI GOOGLE NOS DA EL NOMBRE, LO SEPARAMOS INTELIGENTEMENTE
        if (usuarioGoogle.displayName) {
          const partes = usuarioGoogle.displayName.toUpperCase().split(' ');
          if (partes.length >= 4) {
            this.nombres = partes.slice(0, 2).join(' ');
            this.apellidos = partes.slice(2).join(' ');
          } else if (partes.length >= 2) {
            this.nombres = partes[0];
            this.apellidos = partes.slice(1).join(' ');
          } else {
            this.nombres = partes[0];
          }
        }

        this.modoRegistro = true;
        this.cargando = false;
      }
    } catch (error: any) {
      console.error("Error Auth:", error);
      this.cargando = false;
    }
  }

async procesarRegistroCompleto() {
    if (!this.correoInstitucional || !this.nombres || !this.apellidos || !this.cedula || !this.carreraSeleccionada || !this.ciclo || !this.beca || !this.celular || !this.sede) {
      this.mostrarAviso("Por favor llena todos los campos obligatorios.", 'advertencia');
      return;
    }

    // 🌟 UNIFICAMOS LOS NOMBRES PARA LA BASE DE DATOS
    const nombreUnificado = `${this.nombres.trim()} ${this.apellidos.trim()}`;
    const correoLimpio = this.correoInstitucional.toLowerCase().trim();

    if (!correoLimpio.endsWith('@est.ups.edu.ec') && !correoLimpio.endsWith('@ups.edu.ec')) {
      this.mostrarAviso("El correo ingresado no pertenece a la UPS.", 'advertencia');
      return;
    }

    const valDoc = this.validarDocumento(this.cedula);
    if (!valDoc.valido) {
      this.mostrarAviso("El documento de identidad ingresado no es válido.", 'error'); 
      return;
    }
    this.cedula = this.cedula.trim().toUpperCase(); 

    if (!this.validarCelular(this.celular, this.codigoPais)) {
      this.mostrarAviso("El número de celular ingresado no es válido para su país.", 'info'); 
      return;
    }

    let celularEstandar = this.celular.replace(/\D/g, '');
    if (!celularEstandar.startsWith('0')) {
      celularEstandar = '0' + celularEstandar; 
    }

    this.cargando = true;

    try {
      const estRef = doc(this.firestore, 'Estudiantes', correoLimpio);
      const estSnap = await getDoc(estRef);
      if (estSnap.exists()) {
        this.mostrarAviso(`El correo ${correoLimpio} ya está vinculado a otra cuenta de Google.`, 'advertencia');
        this.cargando = false; 
        return;
      }

      const tutRef = doc(this.firestore, 'Tutores', correoLimpio);
      const tutSnap = await getDoc(tutRef);
      if (tutSnap.exists()) {
        const datosTutor = tutSnap.data();
        if (datosTutor['correo_google'] && datosTutor['correo_google'] !== this.correoGoogle) {
          this.mostrarAviso(`Este correo ya fue vinculado a la cuenta: ${datosTutor['correo_google']}.`, 'advertencia');
          this.cargando = false; 
          return;
        }
        await updateDoc(tutRef, { correo_google: this.correoGoogle });
        const datosActualizados = tutSnap.data();
        datosActualizados['correo_google'] = this.correoGoogle;
        this.activarVistaBienvenida(datosActualizados, datosActualizados['rol'] || 'TUTOR');
        return;
      }

      const adminRef = doc(this.firestore, 'Administradores', correoLimpio);
      const adminSnap = await getDoc(adminRef);
      if (adminSnap.exists()) {
        const datosAdmin = adminSnap.data();
        if (datosAdmin['correo_google'] && datosAdmin['correo_google'] !== this.correoGoogle) {
          this.mostrarAviso(`Este correo ya fue vinculado a la cuenta: ${datosAdmin['correo_google']}.`, 'advertencia');
          this.cargando = false; 
          return;
        }
        await updateDoc(adminRef, { correo_google: this.correoGoogle });
        const datosActualizados = adminSnap.data();
        datosActualizados['correo_google'] = this.correoGoogle;
        this.activarVistaBienvenida(datosActualizados, datosActualizados['rol'] || 'ADMIN');
        return;
      }

      const nuevoEstudiante = {
        correo_google: this.correoGoogle,    
        correo: correoLimpio,                
        nombre_completo: nombreUnificado,
        cedula: this.cedula, 
        sede: this.sede,               
        carrera: this.carreraSeleccionada, 
        ciclo: this.ciclo,
        beca: this.beca,
        codigo_pais: this.codigoPais, 
        celular: celularEstandar,     
        estado: 'ACTIVO',
        rol: 'ESTUDIANTE',
        fecha_registro: new Date().toISOString()
      };

      await this.dbService.registrarNuevoEstudiante(nuevoEstudiante);
      this.activarVistaBienvenida(nuevoEstudiante, 'ESTUDIANTE');

    } catch (e) { 
      console.error("Error al procesar registro:", e); 
      this.mostrarAviso("Hubo un problema verificando o guardando tus datos. Inténtalo de nuevo.", 'error');
      this.cargando = false; 
    }
  }

  activarVistaBienvenida(datos: any, rol: string) {
    const frasesSalesianas = [
      '«La educación es cosa del corazón.» — San Juan Bosco',
      '«Estudia, trabaja, hazte amar y serás feliz.» — San Juan Bosco',
      '«No basta con saber las cosas, es necesario practicarlas.» — San Juan Bosco',
      '«La alegría, el estudio y la piedad son el mejor programa para hacerte feliz.» — San Juan Bosco',
      '«Camina con los pies en la tierra y con el corazón en el cielo.» — San Juan Bosco'
    ];

    this.fraseSalesianaActual = frasesSalesianas[Math.floor(Math.random() * frasesSalesianas.length)];
    this.datosPendientesSesion = datos;
    this.rolPendienteSesion = rol;
    this.cargando = false;
    this.mostrarBienvenida = true;
  }

  continuarDespuesDeBienvenida() {
    this.mostrarBienvenida = false;
    if (this.datosPendientesSesion) {
      this.iniciarSesionLocal(this.datosPendientesSesion, this.rolPendienteSesion);
    }
  }

  iniciarSesionLocal(datos: any, rol: string) {
    localStorage.setItem('correo', datos.correo); 
    localStorage.setItem('nombre', datos.nombre_completo || datos.nombre);
    localStorage.setItem('rol', rol);
    localStorage.setItem('sede', datos.sede || 'CUENCA'); 
    localStorage.setItem('carrera', datos.carrera || ''); 
    localStorage.setItem('ciclo', datos.ciclo);
    localStorage.setItem('cedula', datos.cedula);
    
    localStorage.setItem('celular', datos.celular);
    localStorage.setItem('codigo_pais', datos.codigo_pais || '+593');

    this.cargando = false;
    this.router.navigate(['/tabs/horarios']);
  }

  async mostrarAviso(mensaje: string, tipo: 'exito' | 'error' | 'advertencia' | 'info' = 'exito') {
    let icono = 'checkmark-circle-outline'; let claseCss = 'toast-exito';
    if (tipo === 'error') { icono = 'close-circle-outline'; claseCss = 'toast-error'; } 
    else if (tipo === 'advertencia') { icono = 'warning-outline'; claseCss = 'toast-advertencia'; } 
    else if (tipo === 'info') { icono = 'information-circle-outline'; claseCss = 'toast-info'; }

    const toast = await this.toastController.create({
      message: mensaje, duration: 3000, position: 'top', icon: icono, cssClass: `toast-premium-gietaes ${claseCss}`, mode: 'ios' 
    });
    await toast.present();
  }
  async mostrarBienvenidaSalesiana(nombreUsuario: string): Promise<void> {
    const frasesSalesianas = [
      '«La educación es cosa del corazón.» — San Juan Bosco',
      '«Estudia, trabaja, hazte amar y serás feliz.» — San Juan Bosco',
      '«No basta con saber las cosas, es necesario practicarlas.» — San Juan Bosco',
      '«La alegría, el estudio y la piedad son el mejor programa para hacerte feliz.» — San Juan Bosco',
      '«Camina con los pies en la tierra y con el corazón en el cielo.» — San Juan Bosco'
    ];

    const fraseElegida = frasesSalesianas[Math.floor(Math.random() * frasesSalesianas.length)];

    return new Promise(async (resolve) => {
      const alert = await this.alertController.create({
        header: '¡BIENVENIDO A LAS TUTORIAS ENTRE PARES!',
        subHeader: nombreUsuario,
        message: `Tu registro se ha completado con éxito. Nos alegra acompañarte en tu camino universitario.\n\n${fraseElegida}`,
        cssClass: 'alerta-premium-gietaes',
        backdropDismiss: false,
        mode: 'md',
        buttons: [
          {
            text: '¡COMENZAR!',
            cssClass: 'btn-alerta-confirmar',
            handler: () => resolve()
          }
        ]
      });
      await alert.present();
    });
  }
}
