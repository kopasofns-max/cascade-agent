import { useState, type FormEvent } from "react";
import { ExternalLink, Server, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_BASE_URL, API_TOKEN, clearApiConnection, saveApiConnection, STATIC_PREVIEW } from "@/lib/runtime";

export function ConnectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [url, setUrl] = useState(API_BASE_URL);
  const [token, setToken] = useState(API_TOKEN);
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      saveApiConnection(url, token);
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить подключение");
    }
  };

  const reset = () => {
    clearApiConnection();
    window.location.reload();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="connection-dialog">
        <DialogHeader>
          <DialogTitle><Server size={20} /> Подключение backend</DialogTitle>
          <DialogDescription>
            Укажи отдельно развёрнутый сервер «Каскада». Gemini, Kimi и GitHub token настраиваются только в его <code>.env</code>.
          </DialogDescription>
        </DialogHeader>
        <form className="connection-form" onSubmit={submit}>
          <div>
            <Label htmlFor="api-url">URL backend</Label>
            <Input
              id="api-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://cascade-api.example.com"
              inputMode="url"
              required={STATIC_PREVIEW}
              autoFocus
            />
            <p>Можно указать корень сервера или адрес, заканчивающийся на /api/trpc.</p>
          </div>
          <div>
            <Label htmlFor="api-token">Токен доступа к API <span>· если включён на сервере</span></Label>
            <Input
              id="api-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="CASCADE_API_TOKEN"
              autoComplete="off"
            />
            <p>Это не ключ модели. Токен живёт только в sessionStorage текущей вкладки.</p>
          </div>
          <div className="connection-security">
            <ShieldCheck size={17} />
            <span>Для публичного backend обязательно задай <code>CASCADE_API_TOKEN</code> и <code>CORS_ORIGINS</code>.</span>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="form-footer">
            <a href="https://github.com/kopasofns-max/cascade-agent#отдельный-backend" target="_blank" rel="noreferrer">
              Инструкция <ExternalLink size={13} />
            </a>
            {(API_BASE_URL || API_TOKEN) && <Button type="button" variant="ghost" onClick={reset}>Сбросить</Button>}
            <Button type="submit" className="primary-action">Сохранить и подключить</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
