import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase.ts';

export interface TelegramSettings {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

const LOCAL_STORAGE_KEY = 'lys_telegram_settings_v1';

export const telegramService = {
  async getSettings(): Promise<TelegramSettings> {
    // 1. Try LocalStorage first (instant & reliable fallback)
    let localConfig: TelegramSettings = {
      enabled: false,
      botToken: '',
      chatId: ''
    };
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        localConfig = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Could not read Telegram settings from localStorage:', e);
    }

    // 2. Try Firestore to keep it synced across devices if admin is logged in
    try {
      const docRef = doc(db, 'settings', 'telegram');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const firestoreConfig = snap.data() as TelegramSettings;
        // Merge & update localStorage if firestore is newer/exists
        const merged = { ...localConfig, ...firestoreConfig };
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
        } catch { /* ignore */ }
        return merged;
      }
    } catch (err) {
      // Ignored if permissions are not set yet or offline
      console.log('Using local fallback for Telegram settings: Firestore not readable yet.');
    }

    return localConfig;
  },

  async saveSettings(settings: TelegramSettings): Promise<void> {
    // 1. Save to local storage
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Error saving Telegram settings to localStorage:', e);
    }

    // 2. Try to save to Firestore settings
    try {
      const docRef = doc(db, 'settings', 'telegram');
      await setDoc(docRef, settings, { merge: true });
    } catch (err) {
      console.warn('Could not sync Telegram settings to Firestore (permissions or unregistered):', err);
    }
  },

  async sendBookingNotification(booking: {
    nombre: string;
    telefono: string;
    tipo: string;
    servicio: string;
    fecha: string;
    hora: string;
    direccion: string;
  }): Promise<boolean> {
    try {
      const settings = await this.getSettings();
      if (!settings.enabled || !settings.botToken || !settings.chatId) {
        console.log('Telegram notifications are disabled or incomplete.');
        return false;
      }

      // Format date beautifully (YYYY-MM-DD -> DD/MM/YYYY)
      const parts = booking.fecha.split('-');
      const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : booking.fecha;

      const text = `📅 *NUEVO TURNO RESERVADO* 🧼\n\n` +
        `👤 *Cliente:* ${booking.nombre}\n` +
        `📞 *Teléfono:* ${booking.telefono}\n` +
        `🚗 *Vehículo:* ${booking.tipo}\n` +
        `🧼 *Servicio:* ${booking.servicio}\n` +
        `📆 *Fecha:* ${formattedDate}\n` +
        `⏰ *Hora:* ${booking.hora} hs\n` +
        `📍 *Dirección:* ${booking.direccion}\n\n` +
        `⚡ _Enviado automáticamente por LyS Lavados_`;

      const url = `https://api.telegram.org/bot${settings.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: settings.chatId,
          text: text,
          parse_mode: 'Markdown'
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Telegram Bot API response error:', errText);
        return false;
      }

      console.log('Telegram notification sent successfully!');
      return true;
    } catch (error) {
      console.error('Failed to send Telegram notification:', error);
      return false;
    }
  },

  async sendAccessNotification(): Promise<boolean> {
    try {
      const settings = await this.getSettings();
      if (!settings.enabled || !settings.botToken || !settings.chatId) {
        console.log('Telegram notifications are disabled or incomplete.');
        return false;
      }

      // Format current time beautifully
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      };
      
      let localTime = '';
      try {
        const formatter = new Intl.DateTimeFormat('es-AR', options);
        localTime = formatter.format(now);
      } catch (e) {
        localTime = now.toLocaleString();
      }

      const text = `🚪 *NUEVO INGRESO AL SITIO WEB* 💻\n\n` +
        `🌐 Un usuario de Argentina o internet acaba de ingresar a la web.\n` +
        `⏰ *Hora:* ${localTime} hs\n\n` +
        `⚡ _Enviado automáticamente por LyS Lavados_`;

      const url = `https://api.telegram.org/bot${settings.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: settings.chatId,
          text: text,
          parse_mode: 'Markdown'
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Telegram Bot API response error on access send:', errText);
        return false;
      }

      console.log('Telegram entry notification sent successfully!');
      return true;
    } catch (error) {
      console.error('Failed to send Telegram access notification:', error);
      return false;
    }
  }
};
