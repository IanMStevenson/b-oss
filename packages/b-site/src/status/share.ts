// The "Share a problem" form: client state only. It posts one small JSON body (as text/plain, so the
// browser makes no CORS preflight) to the shares endpoint and shows the outcome. Nothing here ever
// displays or works out a time after which sharing is possible again.

interface Turnstile {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (t: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ): string;
  reset(id?: string): void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

type Phase = 'idle' | 'sharing' | 'thanks' | 'already' | 'error';

export interface ShareConfig {
  endpoint: string;
  siteKey: string;
}

const q = <T extends Element>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`status page: missing ${sel}`);
  return el;
};

export function initShare(root: HTMLElement, cfg: ShareConfig): void {
  const form = q<HTMLFormElement>(root, 'form');
  const fields = q<HTMLElement>(root, '[data-fields]');
  const submit = q<HTMLButtonElement>(root, '[data-submit]');
  const hint = q<HTMLElement>(root, '[data-hint]');
  const banner = q<HTMLElement>(root, '[data-error]');
  const already = q<HTMLElement>(root, '[data-already]');
  const thanks = q<HTMLElement>(root, '[data-thanks]');
  const done = q<HTMLButtonElement>(root, '[data-done]');
  const tsBox = q<HTMLElement>(root, '[data-turnstile]');
  let token = '';
  let phase: Phase = 'idle';
  let widget: string | undefined;

  root.hidden = false;

  if (cfg.siteKey) {
    tsBox.textContent = '';
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      widget = window.turnstile?.render(tsBox, {
        sitekey: cfg.siteKey,
        callback: (t) => {
          token = t;
          update();
        },
        'expired-callback': () => {
          token = '';
          update();
        },
        'error-callback': () => {
          token = '';
          update();
        },
      });
    };
    document.head.append(script);
  }

  const chosen = (name: string): string | null =>
    form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? null;
  const tags = (): string[] =>
    [...form.querySelectorAll<HTMLInputElement>('input[name="tag"]:checked')].map((i) => i.value);

  function update(): void {
    const ready =
      chosen('using') !== null && chosen('what') !== null && (!cfg.siteKey || token !== '');
    submit.disabled = phase === 'sharing' || !ready;
    hint.hidden = ready;
    for (const f of fields.querySelectorAll('fieldset')) f.disabled = phase === 'sharing';
    submit.classList.toggle('is-busy', phase === 'sharing');
    submit.textContent =
      phase === 'sharing' ? 'Sharing…' : phase === 'error' ? 'Try again' : 'Share';
    form.hidden = phase === 'already';
    already.hidden = phase !== 'already';
    banner.hidden = phase !== 'error';
    thanks.hidden = phase !== 'thanks';
    root.classList.toggle('is-thanks', phase === 'thanks');
  }

  function set(p: Phase): void {
    phase = p;
    update();
    if (p === 'thanks') done.focus();
  }

  form.addEventListener('change', update);
  async function onSubmit(e: Event): Promise<void> {
    e.preventDefault();
    if (submit.disabled) return;
    set('sharing');
    const body = JSON.stringify({
      component: chosen('using') === 'app' ? 'api' : 'site',
      what: chosen('what'),
      tags: tags(),
      turnstileToken: token,
    });
    try {
      const res = await fetch(cfg.endpoint, {
        method: 'POST',
        // text/plain keeps this a "simple" request: no CORS preflight (each would cost a Worker invocation).
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body,
        credentials: 'omit',
      });
      if (res.status === 201) set('thanks');
      else if (res.status === 429) set('already');
      else set('error');
    } catch {
      set('error');
    }
    if (phase !== 'sharing' && cfg.siteKey) {
      token = '';
      window.turnstile?.reset(widget);
      update();
    }
  }
  form.addEventListener('submit', (e) => {
    void onSubmit(e);
  });

  done.addEventListener('click', () => {
    form.reset();
    token = '';
    set('idle');
    q<HTMLElement>(root, 'h3').focus();
  });
  thanks.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') done.click();
  });
  update();
}
