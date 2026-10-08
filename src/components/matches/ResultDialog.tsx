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
import type { Match, Tip } from "@/types";

interface Props {
  /** `null` closes the dialog. */
  match: Match | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** The saved match and the caller's own rescored tip (`null` if they did not tip the match). */
  onSaved: (match: Match, tip: Tip | null) => void;
  /** Returns focus to the button that opened the dialog. */
  onCloseAutoFocus: (event: Event) => void;
}

interface ResultResponse {
  match: Match;
  tip: Tip | null;
}

type ScoresInput = z.input<typeof scoresSchema>;

export function ResultDialog({ match, isOpen, onOpenChange, onSaved, onCloseAutoFocus }: Props) {
  return (
    <Dialog open={isOpen && match !== null} onOpenChange={onOpenChange}>
      {match && (
        <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>
              Wynik meczu: {match.side_a} – {match.side_b}
            </DialogTitle>
            <DialogDescription>
              {formatWarsaw(match.starts_at)}. Wpisujesz końcowy wynik meczu (nie swój typ). Punkty przeliczą się
              wszystkim.
            </DialogDescription>
          </DialogHeader>

          {/* Content unmounts on close, so every opening starts from the current result. */}
          <ResultForm
            match={match}
            onSaved={(saved, tip) => {
              onSaved(saved, tip);
              onOpenChange(false);
              toast.success(
                saved.score_a !== null && saved.score_b !== null
                  ? `Zapisano wynik ${saved.score_a}:${saved.score_b}`
                  : "Usunięto wynik",
              );
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

interface ResultFormProps {
  match: Match;
  onSaved: (match: Match, tip: Tip | null) => void;
}

function ResultForm({ match, onSaved }: ResultFormProps) {
  const id = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const hasResult = match.score_a !== null && match.score_b !== null;
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ScoresInput, unknown, z.output<typeof scoresSchema>>({
    resolver: zodResolver(scoresSchema),
    defaultValues: {
      score_a: match.score_a !== null ? String(match.score_a) : "",
      score_b: match.score_b !== null ? String(match.score_b) : "",
    },
  });
  const busy = isSubmitting || isClearing;

  const send = async (values: Record<string, string>) => {
    setServerError(null);
    const result = await postForm<ResultResponse>("/api/results", { match_id: String(match.id), ...values });
    if (result.data === null) {
      setServerError(result.error);
      return;
    }
    onSaved(result.data.match, result.data.tip);
  };

  // The API re-runs the schema, so it gets the raw strings, not the transformed numbers.
  const onSubmit = () => send(getValues());

  // Clearing skips field validation: the inputs do not matter.
  const onClear = async () => {
    setIsClearing(true);
    try {
      await send({ action: "clear" });
    } finally {
      setIsClearing(false);
    }
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

      <ServerError message={serverError} />

      <DialogFooter>
        {hasResult && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void onClear()}>
            Usuń wynik
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          Zapisz wynik
        </Button>
      </DialogFooter>
    </form>
  );
}
