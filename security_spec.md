# Security Specification for LyS Premium Detailing Firestore

This document outlines the security invariants, verification payloads, and access rules for the Firebase Firestore setup in LyS Premium Detailing, supporting the migrated agenda, cash flow, catalog pricing, and photo gallery.

## 1. Data Invariants
- **Traces**: Write-once for telemetry. Only the admin (`leandro.saralegui@gmail.com`) can read, list, or delete logs.
- **Bookings (Turnos)**: Unauthenticated clients can create bookings, matching exact shape validations. Clients can fetch their single booking (`get` by ID) to render receipt screens, but ONLY the verified admin can list (`list`), update status, or delete bookings.
- **Taken Slots**: Anyone can read and list taken slots (since they contain no PII, they only have date/times) to build calendars. Non-admins can only create slots where `isBlocked == false`. Admin can create, delete, and set `isBlocked == true`.
- **Caja (Movements)**: Strictly isolated. Only the verified admin can read, write, update, or list cash flow items. Absolute denial of all guest/unauthorized queries.
- **Services, Vehicles & Gallery**: Publicly readable (`read`, `list`) for all users to browse prices and work results. Only the verified admin can modify, create, update, or delete catalog items and photos.

## 2. The "Dirty Dozen" Payloads (Malicious attempts)
Each payload is explicitly blocked by the rules:
1. **Unauth Booking List**: A guest user attempts to run a query listing all client bookings (PII Exposure prevention).
2. **Bookings Shadow Field**: Creating a booking with an unauthorized property (`{ id, fecha, hora, tipo, servicio, nombre, telefono, direccion, estado, rootAccess: true }`).
3. **Spoofed User Rating/Privileges**: Attempting to bypass the admin check by passing a simulated auth object with `isAdmin: true` on the client.
4. **Caja Hijacking (Unauth Read)**: Trying to read `/movements` list as an unauthenticated guest.
5. **Caja Modification**: Attempting to write a cash withdrawal/gasto without admin authorization.
6. **Self-Blocked Hour**: A normal user attempting to reserve a slot setting `isBlocked = true` manually.
7. **Junk Character IDs**: Injecting SQL/Unicode/Overflow strings (e.g. 500 characters) into a booking path parameter to trigger service crashes.
8. **Malicious Catalog Alteration**: An unauthenticated user attempts to update base prices of washes in `/services/Exterior` to $0.
9. **No-PII Leakage Bypass**: Authenticated non-admin attempting to request someone else's booking.
10. **Shadow Field on Service**: Adding an unrequested field `malicious_script` to a washed service catalog document.
11. **Malicious Gallery Injection**: Attempting to push fake images/external script URLs into the `gallery` collection.
12. **Trace Tampering**: Attempting to edit or clear logged traffic metrics.

## 3. Test Runner Mock Definition (`firestore.rules.test.ts`)
```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

describe('Firestore Security Rules', () => {
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'virtual-photon-31b2m',
      firestore: {
        rules: require('fs').readFileSync('firestore.rules', 'utf8')
      }
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('prohibits guest users from listing bookings', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthDb.collection('bookings').get());
  });

  it('allows unauthenticated users to create validation-conforming bookings', async () => {
    const guestDb = testEnv.unauthenticatedContext().firestore();
    const validBooking = {
      id: "b10",
      fecha: "2026-06-05",
      hora: "11:00",
      tipo: "auto",
      servicio: "Exterior",
      nombre: "Martin Gomez",
      telefono: "1155556666",
      direccion: "Belgrano 123",
      estado: "pendiente"
    };
    await assertSucceeds(guestDb.collection('bookings').doc('b10').set(validBooking));
  });

  it('denies writing to movements (Caja) for any non-admin users', async () => {
    const guestDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(guestDb.collection('movements').doc('mov-1').set({ 
      id: "mov-1", fecha: "2026-06-01", tipo: "Gasto", categoria: "Insumos", concepto: "Champú", monto_ars: 5000, medio: "Efectivo", estado: "Pagado" 
    }));
  });

  it('allows admin read/write on movements', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', {
      email: 'leandro.saralegui@gmail.com',
      email_verified: true
    }).firestore();
    await assertSucceeds(adminDb.collection('movements').get());
  });
});
```
