# Plan de Implementación Final: Duraciones Internas de Equipo (2hs) y Grilla Inteligente

Este plan consolida tu gran idea: **calibrar internamente todos los servicios a ritmo de trabajo en equipo (2 personas)**, manteniendo esa duración oculta de la web pública y aprovechando que los turnos base ya cuentan con el espaciado suficiente para cuando trabajás solo.

---

## 1. Calibración de Duraciones Internas (En Equipo x2)

Las duraciones en el sistema se usarán **únicamente de forma interna para el cálculo de bloques y solapamientos**, sin mostrar etiquetas de tiempo al cliente en el cotizador o catálogo web:

| Servicio | Duración Interna Anterior | Nueva Duración Interna (x2) | Bloques que Ocupa |
| :--- | :---: | :---: | :---: |
| **Lavado Full / Combo** | 180 min (3 hs) | **120 min (2 hs)** | Exactamente 1 bloque de tarde (15-17 o 17-19) |
| **Lavado Exterior** | 90 min | **60 min (1 h)** | 1 bloque corto |
| **Detallado Interior** | 90 min | **60 min (1 h)** | 1 bloque corto |
| **Tapizados de Tela** | 90 min | **60 min (1 h)** | 1 bloque corto |
| **Limpieza de Techo** | 60 min | **45 min** | Fracción de bloque |
| **Tapizados de Cuero** | 60 min | **45 min** | Fracción de bloque |
| **COMBO COMPLETO (Ext + Int + Tapizados + Techo)** | 330 min (5.5 hs) | **225 min (3h 45m)** | 2 bloques seguidos (toda la mañana o toda la tarde) |

---

## 2. Por Qué Funciona a la Perfección Tanto Solo Como en Pareja

### A. Cuando trabajás solo (Turnos Base Individuales):
Los turnos base de la grilla ya están diseñados con separación natural de 3 a 4 horas:
* Entre las `09:00` y las `12:00` hay **3 horas** de margen.
* Entre las `12:00` y las `15:00` hay **3 horas** de margen.
* Los sábados entre `08:00`, `12:00` y `16:00` hay **4 horas** de margen.
👉 Aunque la duración interna diga 2 horas, vos disponés de hasta 3 o 4 horas reales para terminar el auto solo con tranquilidad.

### B. Cuando trabajan juntos (Tarde y Sábados Dinámicos):
* La ventana de `15:00 a 17:00` (2 horas) y `17:00 a 19:00` (2 horas) calza **exactamente** con la duración interna de 120 minutos de un Lavado Full.
* Los sábados, el bloque de `08:00 a 10:00` y de `10:00 a 12:00` encaja de manera perfecta.

### C. ¿Qué pasa si piden un servicio largo (ej. Combo 3h 45m)?
* Si entra a las `08:00`: dura hasta las 11:45hs. Bloquea automáticamente las `09:00` y `10:00`. El turno de las `12:00` queda impecable para el siguiente auto.
* Si entra a las `15:00`: dura hasta las 18:45hs. Bloquea automáticamente las `17:00`.

---

## 3. Matriz Completa de la Semana

1. **Lunes:**
   * Slots: `12:00`, `15:00`, `17:00` (mañana libre sin turnos).
2. **Martes:**
   * Slots: `07:00`, `08:00`, `09:00`, `12:00` + **solo 1 turno de tarde** (`15:00` o `17:00`, al reservarse uno el otro se bloquea).
3. **Miércoles a Viernes:**
   * Slots con anticipación: `07:00`, `08:00`, `09:00`, `12:00`, `15:00`, `17:00`.
   * Reservas para **hoy (mismo día)**: solo 1 turno de tarde (`15:00` o `17:00`).
4. **Sábados Dinámicos:**
   * Slots base: `08:00`, `12:00`, `16:00`.
   * Desbloqueo condicional:
     * Al ocuparse las `08:00` (con duración <= 120 min) ➔ Se desbloquea `10:00`.
     * Al ocuparse las `12:00` (con duración <= 120 min) ➔ Se desbloquea `14:00`.
     * Al ocuparse las `16:00` (con duración <= 120 min) ➔ Se desbloquea `18:00`.

---

## 4. Archivos a Modificar
* `src/constants.ts` y `src/services/firestoreService.ts`:
  * Ajustar `calculateDurationFromServiceName` con los tiempos internos de equipo (Full: 120m, Ext: 60m, Int: 60m, Tapizados: 60m, Techo: 45m).
  * Asegurar que no se muestre la duración en minutos/horas en la interfaz web pública.
* `src/services/availabilityService.ts`:
  * Implementar las reglas de lunes (desde las 12), martes (1 de tarde), mismo día (1 de tarde) y sábados dinámicos en pares.
* `src/components/AdminAgenda.tsx`:
  * Sincronizar la vista Timeline con los slots `07:00`, `08:00`, `09:00`, `12:00`, `15:00`, `17:00` (y los intermedios del sábado).
