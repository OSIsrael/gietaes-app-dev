import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TutorEstadoService {
  private mostrarTabAsistenciaSubject = new BehaviorSubject<boolean>(false);
  mostrarTabAsistencia$ = this.mostrarTabAsistenciaSubject.asObservable();

  habilitarTabAsistencia() {
    this.mostrarTabAsistenciaSubject.next(true);
  }

  ocultarTabAsistencia() {
    this.mostrarTabAsistenciaSubject.next(false);
  }
}