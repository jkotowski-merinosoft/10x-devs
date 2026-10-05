import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "astro/zod";
import { toast } from "sonner";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { postForm } from "@/lib/api-client";
import { scoresSchema } from "@/lib/schemas/tip";
import { formatWarsaw } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Match, Tip } from "@/types";

interface Props {
  /** `null` closes the dialog. */
  match: Match | null;
  tip: Tip | undefined;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (tip: Tip) => void;
  /** Returns focus to the button that opened the dialog. */
  onCloseAutoFocus: (event: Event) => void;
  /** Server time (ms) for the open/closed status; never `Date.now()` in render. The API has the final say. */
  now: number;
}

type ScoresInput = z.input<typeof scoresSchema>;

export function TipDialog({ match, tip, isOpen, onOpenChange, onSaved, onCloseAutoFocus, now }: Props) {
  const bettingOpen = match ? now < new Date(match.starts_at).getTime() : false;

  return (
    <Dialog open={isOpen && match !== null} onOpenChange={onOpenChange}>
      {match && (
        <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>
              {match.side_a} – {match.side_b}
            </DialogTitle>
            <DialogDescription>{formatWarsaw(match.starts_at)}</DialogDescription>
            <p className={cn("text-sm", bettingOpen ? "text-green-300" : "text-blue-100/60")}>
              {bettingOpen ? `Typowanie otwarte do ${formatWarsaw(match.starts_at)}` : "Typowanie zamknięte"}
            </p>
          </DialogHeader>

          {bettingOpen ? (
            // Content unmounts on close, so every opening starts from the current tip.
            <TipForm
              match={match}
              tip={tip}
              onSaved={(saved) => {
                onSaved(saved);
                onOpenChange(false);
                toast.success(`Zapisano typ ${saved.score_a}:${saved.score_b}`);
              }}
            />
          ) : (
            <div className="space-y-4 text-sm">
              <p>{tip ? `Twój typ: ${tip.score_a}:${tip.score_b}` : "brak typu"}</p>
              <a
                href={`/matches/${match.id}`}
                className="text-purple-300 transition-colors hover:text-purple-100 hover:underline"
              >
                Zobacz typy wszystkich
              </a>
            </div>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}

interface TipFormProps {
  match: Match;
  tip: Tip | undefined;
  onSaved: (tip: Tip) => void;
}

function TipForm({ match, tip, onSaved }: TipFormProps) {
  const id = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ScoresInput, unknown, z.output<typeof scoresSchema>>({
    resolver: zodResolver(scoresSchema),
    defaultValues: {
      score_a: tip ? String(tip.score_a) : "",
      score_b: tip ? String(tip.score_b) : "",
    },
  });

  // The API re-runs the schema, so it gets the raw strings, not the transformed numbers.
  const onSubmit = async () => {
    setServerError(null);
    const result = await postForm<{ tip: Tip }>("/api/tips", {
      match_id: String(match.id),
      ...getValues(),
    });
    if (result.data === null) {
      setServerError(result.error);
      return;
    }
    onSaved(result.data.tip);
  };

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!errors.score_a}>
          <FieldLabel htmlFor={`${id}-score-a`}>{match.side_a}</FieldLabel>
          <Input
            id={`${id}-score-a`}
            type="number"
            min={0}
            max={99}
            step={1}
            inputMode="numeric"
            aria-invalid={!!errors.score_a}
            {...register("score_a")}
          />
          <FieldError errors={[errors.score_a]} />
        </Field>
        <Field data-invalid={!!errors.score_b}>
          <FieldLabel htmlFor={`${id}-score-b`}>{match.side_b}</FieldLabel>
          <Input
            id={`${id}-score-b`}
            type="number"
            min={0}
            max={99}
            step={1}
            inputMode="numeric"
            aria-invalid={!!errors.score_b}
            {...register("score_b")}
          />
          <FieldError errors={[errors.score_b]} />
        </Field>
      </div>

      <p className="text-sm text-blue-100/60">
        Trafiony zwycięzca albo remis też daje punkty, nawet przy innym wyniku.
      </p>

      <ServerError message={serverError} />

      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {tip ? "Popraw typ" : "Zapisz typ"}
        </Button>
      </DialogFooter>
    </form>
  );
}
