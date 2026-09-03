import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface Trace { nombre: string; argumentos: unknown; resultado: string; }
interface Message { role: 'user' | 'assistant'; content: string; }
interface ChatResponse { reply: string; toolCalls: Trace[]; needsConfirmation: boolean; }

@Component({
  selector: 'app-root', imports: [CommonModule, FormsModule], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="shell">
      <section class="masthead"><p class="eyebrow">PERIFERIA IT GROUP</p><h1>Registro de proveedor</h1><p>Agente de preparacion documental con aprobacion humana.</p></section>
      <section class="workspace">
        <div class="conversation" aria-live="polite">
          <div class="welcome" *ngIf="messages().length === 0"><span>01</span><div><h2>Procesa una solicitud</h2><p>Prueba: <button (click)="useExample()">Procesa el caso ec-corp-andina</button></p></div></div>
          <article *ngFor="let item of messages()" class="message" [class.user]="item.role === 'user'"><span>{{ item.role === 'user' ? 'ANALISTA' : 'AGENTE' }}</span><p>{{ item.content }}</p></article>
          <div *ngIf="thinking()" class="thinking"><i></i><i></i><i></i> El agente esta consultando el repositorio</div>
        </div>
        <aside class="trace"><div><p class="eyebrow">TRAZABILIDAD</p><h2>Herramientas</h2></div><p class="empty" *ngIf="traces().length === 0">Las acciones verificables apareceran aqui.</p>
          <details *ngFor="let trace of traces()" open><summary>{{ trace.nombre }}</summary><p><b>Argumentos</b> {{ pretty(trace.argumentos) }}</p><p><b>Resultado</b> {{ shortResult(trace.resultado) }}</p></details>
        </aside>
      </section>
      <section class="composer"><div *ngIf="needsConfirmation()" class="confirm">Confirmacion requerida: responde “si” para crear solo el envio simulado.</div><textarea [(ngModel)]="draft" (keydown.control.enter)="send()" placeholder="Describe la solicitud o indica un caso..." [disabled]="thinking()"></textarea><button class="send" (click)="send()" [disabled]="thinking() || !draft.trim()">{{ thinking() ? 'Procesando' : 'Enviar' }}</button></section>
    </main>
  `,
  styles: []
})
export class AppComponent {
  private http = inject(HttpClient); readonly sessionId = crypto.randomUUID();
  readonly messages = signal<Message[]>([]); readonly traces = signal<Trace[]>([]); readonly thinking = signal(false); readonly needsConfirmation = signal(false);
  draft = '';
  useExample() { this.draft = 'Procesa el caso ec-corp-andina. Dime que campos quedaron llenos, cuales faltan, si esta listo para firma y que soportes debo actualizar. No envies nada todavia.'; }
  send() { this.submit(this.draft.trim()); }
  private submit(message: string) {
    if (!message || this.thinking()) return;
    this.messages.update((items) => [...items, { role: 'user', content: message }]); this.draft = ''; this.thinking.set(true);
    this.http.post<ChatResponse>('/api/chat', { sessionId: this.sessionId, message }).subscribe({
      next: (response) => { this.messages.update((items) => [...items, { role: 'assistant', content: response.reply }]); this.traces.set(response.toolCalls); this.needsConfirmation.set(response.needsConfirmation); this.thinking.set(false); },
      error: () => { this.messages.update((items) => [...items, { role: 'assistant', content: 'No fue posible conectar con el backend. Verifica que npm run dev este activo.' }]); this.thinking.set(false); }
    });
  }
  pretty(value: unknown) { return JSON.stringify(value); }
  shortResult(value: string) { try { const parsed = JSON.parse(value); return parsed.ok ? JSON.stringify(parsed.data).slice(0, 240) : parsed.error; } catch { return value.slice(0, 240); } }
}
