import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "astro/zod";
import { Plus } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { postForm } from "@/lib/api-client";
import { matchSchema } from "@/lib/schemas/match";
import type { Match } from "@/types";

interface Props {
  onCreated: (match: Match) => void;
}

type MatchFormInput = z.input<typeof matchSchema>;

const EMPTY: MatchFormInput = { side_a: "", side_b: "", starts_at: "" };

export function AddMatchDialog({ onCreated }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MatchFormInput, unknown, z.output<typeof matchSchema>>({
    resolver: zodResolver(matchSchema),
    defaultValues: EMPTY,
  });

  // The resolver hands `onSubmit` transformed values (UTC `starts_at`); the API re-runs the
  // same schema, so it gets the raw field values instead.
  const onSubmit = async () => {
    setServerError(null);
    const result = await postForm<{ match: Match }>("/api/matches", getValues());
    if (result.data === null) {
      setServerError(result.error);
      return;
    }
    onCreated(result.data.match);
    reset(EMPTY);
    setOpen(false);
    toast.success("Dodano mecz");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setServerError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" data-testid="add-match">
          <Plus aria-hidden="true" />
          Dodaj mecz
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dodaj mecz</DialogTitle>
          <DialogDescription>Godzinę rozpoczęcia podaj w czasie warszawskim.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="space-y-6">
          <FieldGroup className="gap-4">
            <Field data-invalid={!!errors.side_a}>
              <FieldLabel htmlFor={`${id}-side-a`}>Strona A</FieldLabel>
              <Input
                id={`${id}-side-a`}
                maxLength={100}
                aria-invalid={!!errors.side_a}
                autoComplete="off"
                {...register("side_a")}
              />
              <FieldError errors={[errors.side_a]} />
            </Field>
            <Field data-invalid={!!errors.side_b}>
              <FieldLabel htmlFor={`${id}-side-b`}>Strona B</FieldLabel>
              <Input
                id={`${id}-side-b`}
                maxLength={100}
                aria-invalid={!!errors.side_b}
                autoComplete="off"
                {...register("side_b")}
              />
              <FieldError errors={[errors.side_b]} />
            </Field>
            <Field data-invalid={!!errors.starts_at}>
              <FieldLabel htmlFor={`${id}-starts-at`}>Rozpoczęcie (czas warszawski)</FieldLabel>
              <Input
                id={`${id}-starts-at`}
                type="datetime-local"
                aria-invalid={!!errors.starts_at}
                className="[color-scheme:dark]"
                {...register("starts_at")}
              />
              <FieldError errors={[errors.starts_at]} />
            </Field>
          </FieldGroup>

          <ServerError message={serverError} />

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Dodawanie..." : "Dodaj mecz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
