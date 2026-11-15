import { useEffect, useState, type FormEvent } from "react";
import { BarChart3, Code2, LoaderCircle, Plus, Server } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { STATIC_PREVIEW } from "@/lib/runtime";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const emptyForm = {
  title: "",
  repoUrl: "",
  baseBranch: "main",
  taskType: "code" as "code" | "analysis",
  prompt: "",
  acceptanceCriteria: "",
  checkCommands: "",
  executorModel: "",
  reviewerModel: "",
  finalModel: "",
  maxAttempts: 2,
};

export function NewTaskDialog({
  open,
  onOpenChange,
  onCreated,
  onConnect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: number) => void;
  onConnect: () => void;
}) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const utils = trpc.useUtils();
  const system = trpc.system.status.useQuery(undefined, { enabled: !STATIC_PREVIEW, staleTime: 30_000 });
  const create = trpc.tasks.create.useMutation({
    onSuccess: async (task) => {
      if (!task) return;
      await utils.tasks.list.invalidate();
      onCreated(task.id);
      onOpenChange(false);
      setForm(emptyForm);
      setError("");
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  useEffect(() => {
    if (!open || !system.data) return;
    setForm((current) => ({
      ...current,
      executorModel: current.executorModel || system.data.defaults.executor,
      reviewerModel: current.reviewerModel || system.data.defaults.reviewer,
      finalModel: current.finalModel || system.data.defaults.final,
    }));
  }, [open, system.data]);

  const update = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    create.mutate({
      ...form,
      checkCommands: form.checkCommands || undefined,
      executorModel: form.executorModel || undefined,
      reviewerModel: form.reviewerModel || undefined,
      finalModel: form.finalModel || undefined,
    });
  };

  const modelSelect = (
    key: "executorModel" | "reviewerModel" | "finalModel",
    label: string,
    description: string,
  ) => (
    <div className="model-field">
      <Label htmlFor={key}>{label}</Label>
      <Select value={form[key]} onValueChange={(value) => update(key, value)}>
        <SelectTrigger id={key} className="task-select">
          <SelectValue placeholder="Модель по умолчанию" />
        </SelectTrigger>
        <SelectContent>
          {(system.data?.models || []).map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.label} · {model.provider}
            </SelectItem>
          ))}
          {!system.data?.models.length && (
            <SelectItem value={`default-${key}`} disabled>
              Список моделей недоступен
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      <p>{description}</p>
    </div>
  );

  if (STATIC_PREVIEW) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="connection-dialog">
          <DialogHeader>
            <DialogTitle><Server size={20} /> Сначала подключи backend</DialogTitle>
            <DialogDescription>
              GitHub Pages отдаёт только интерфейс. Задача появится после подключения сервера с базой, sandbox и серверными ключами.
            </DialogDescription>
          </DialogHeader>
          <div className="connection-security">
            <Server size={17} />
            <span>Никакие вызовы моделей не выполняются в статическом preview.</span>
          </div>
          <div className="form-footer">
            <p>Настройка займёт меньше минуты, если API уже развёрнут.</p>
            <Button className="primary-action" onClick={onConnect}>Настроить подключение</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="new-task-dialog">
        <DialogHeader>
          <DialogTitle>Новая задача для каскада</DialogTitle>
          <DialogDescription>
            Сервис создаст отдельную ветку. После проверок и двух ревью появится Pull Request — без автоматического merge.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="task-form">
          <div className="form-section">
            <div className="form-section-heading">
              <span>01</span>
              <h3>Задача</h3>
            </div>
            <div className="field-grid">
              <div className="field-span-2">
                <Label htmlFor="task-title">Короткое название</Label>
                <Input
                  id="task-title"
                  value={form.title}
                  onChange={(event) => update("title", event.target.value)}
                  placeholder="Добавить выгрузку лидов в CSV"
                  required
                  minLength={3}
                  maxLength={255}
                />
              </div>
              <div className="field-span-2">
                <Label>Тип работы</Label>
                <div className="task-type-switch" role="radiogroup" aria-label="Тип работы">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.taskType === "code"}
                    className={form.taskType === "code" ? "selected" : ""}
                    onClick={() => update("taskType", "code")}
                  >
                    <Code2 size={16} /> Код
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.taskType === "analysis"}
                    className={form.taskType === "analysis" ? "selected" : ""}
                    onClick={() => update("taskType", "analysis")}
                  >
                    <BarChart3 size={16} /> Аналитика
                  </button>
                </div>
              </div>
              <div className="field-span-2">
                <Label htmlFor="task-prompt">Что нужно сделать</Label>
                <Textarea
                  id="task-prompt"
                  value={form.prompt}
                  onChange={(event) => update("prompt", event.target.value)}
                  placeholder="Опиши результат, ограничения и важные детали реализации…"
                  required
                  minLength={10}
                  rows={4}
                />
              </div>
              <div className="field-span-2">
                <Label htmlFor="task-acceptance">Критерии приёмки</Label>
                <Textarea
                  id="task-acceptance"
                  value={form.acceptanceCriteria}
                  onChange={(event) => update("acceptanceCriteria", event.target.value)}
                  placeholder={"Кнопка выгружает CSV с UTM и датой сделки.\nСуществующие тесты проходят."}
                  required
                  rows={3}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-heading">
              <span>02</span>
              <h3>Репозиторий и проверки</h3>
            </div>
            <div className="field-grid">
              <div className="field-span-2">
                <Label htmlFor="task-repo">GitHub-репозиторий</Label>
                <Input
                  id="task-repo"
                  type="text"
                  inputMode="url"
                  value={form.repoUrl}
                  onChange={(event) => update("repoUrl", event.target.value)}
                  placeholder={system.data?.localRepositories ? "https://github.com/owner/repo или file:///path/repo" : "https://github.com/owner/repo"}
                  required
                />
              </div>
              <div>
                <Label htmlFor="task-branch">Базовая ветка</Label>
                <Input
                  id="task-branch"
                  value={form.baseBranch}
                  onChange={(event) => update("baseBranch", event.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="task-attempts">Попыток доработки</Label>
                <Select value={String(form.maxAttempts)} onValueChange={(value) => update("maxAttempts", Number(value))}>
                  <SelectTrigger id="task-attempts" className="task-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 проход</SelectItem>
                    <SelectItem value="2">До 2 проходов</SelectItem>
                    <SelectItem value="3">До 3 проходов</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="field-span-2">
                <Label htmlFor="task-checks">Команды проверки <span>· необязательно</span></Label>
                <Textarea
                  id="task-checks"
                  value={form.checkCommands}
                  onChange={(event) => update("checkCommands", event.target.value)}
                  placeholder={"npm test\nnpm run build"}
                  rows={2}
                />
                <p className="field-hint">Каждая команда — с новой строки. Если пусто, определим по package.json или pytest.</p>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-heading">
              <span>03</span>
              <h3>Модели</h3>
            </div>
            <div className="model-grid">
              {modelSelect("executorModel", "Исполнитель", "Читает репозиторий и вносит правки.")}
              {modelSelect("reviewerModel", "Ревьюер", "Проверяет diff и логи после тестов.")}
              {modelSelect("finalModel", "Финальный контроль", "Разрешает PR или возвращает задачу.")}
            </div>
            {system.data?.modelError && (
              <p className="form-warning">Список моделей не загружен. Будут использованы серверные настройки: {system.data.modelError}</p>
            )}
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}

          <div className="form-footer">
            <p>Ключи и GitHub token остаются на сервере.</p>
            <Button type="submit" className="primary-action" disabled={create.isPending}>
              {create.isPending ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
              {create.isPending ? "Создаю…" : "Запустить каскад"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
