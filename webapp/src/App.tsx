import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchNextCard, submitReview } from "./api";
import {
  configureMainButton,
  hideMainButton,
  initTelegram,
  teardownTelegram,
} from "./telegram";
import type { PracticeCard, ReviewGrade } from "./types";

const GRADE_OPTIONS: Array<{
  id: ReviewGrade;
  label: string;
  hint: string;
  tone: "forgot" | "wrong" | "hard" | "difficult" | "good" | "easy";
}> = [
  { id: 0, label: "Forgot", hint: "0", tone: "forgot" },
  { id: 1, label: "Wrong", hint: "1", tone: "wrong" },
  { id: 2, label: "Hard", hint: "2", tone: "hard" },
  { id: 3, label: "Difficult", hint: "3", tone: "difficult" },
  { id: 4, label: "Good", hint: "4", tone: "good" },
  { id: 5, label: "Easy", hint: "5", tone: "easy" },
];

const KEY_TO_GRADE: Record<string, ReviewGrade> = {
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
};

function gradeLabel(grade: ReviewGrade) {
  return GRADE_OPTIONS.find((option) => option.id === grade)?.label || "Submit";
}

export default function App() {
  const [card, setCard] = useState<PracticeCard | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState<boolean>(false);
  const [selectedGrade, setSelectedGrade] = useState<ReviewGrade | null>(null);
  const [remainingDue, setRemainingDue] = useState<number>(0);
  const [totalDue, setTotalDue] = useState<number>(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(
    null,
  );

  const completed = useMemo(() => {
    if (!totalDue) return 0;
    return Math.max(totalDue - remainingDue, 0);
  }, [remainingDue, totalDue]);

  const progress = useMemo(() => {
    if (!totalDue) return 0;
    return Math.min(completed / totalDue, 1);
  }, [completed, totalDue]);

  const showToast = useCallback((message: string, tone: "success" | "error" = "success") => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const loadNextCard = useCallback(async (overrideSession?: string | null) => {
    try {
      setLoading(true);
      setError(null);
      setShowAnswer(false);
      setSelectedGrade(null);
      hideMainButton();
      const response = await fetchNextCard(overrideSession ?? sessionRef.current);
      if (typeof response.dueCount === "number") {
        setTotalDue((prev) => (prev === 0 ? response.dueCount : Math.max(prev, response.dueCount)));
        setRemainingDue(response.dueCount);
      }
      sessionRef.current = response.sessionId;
      if (response.done || !response.card) {
        setCard(null);
        setStartTime(null);
      } else {
        setCard(response.card);
        setStartTime(response.startTime ?? Date.now());
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load card";
      setError(
        message.toLowerCase() === "unauthorized"
          ? "Authentication failed. Please reopen the bot from Telegram."
          : message,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!card || selectedGrade === null || submitting) {
      return;
    }
    const grade = selectedGrade;
    const currentCard = card;
    const previousRemaining = remainingDue;
    const startedAt = startTime ?? Date.now();

    setSubmitting(true);
    setRemainingDue((prev) => Math.max(prev - 1, 0));

    try {
      const response = await submitReview({
        sessionId: sessionRef.current ?? undefined,
        cardId: currentCard.id,
        grade,
        elapsedMs: Math.max(Date.now() - startedAt, 0),
        clientTs: Date.now(),
      });

      if (typeof response.remainingDue === "number") {
        setRemainingDue(response.remainingDue);
      }

      await loadNextCard(sessionRef.current);
      showToast("Recorded!", "success");
    } catch (err) {
      setRemainingDue(previousRemaining);
      setCard(currentCard);
      setShowAnswer(true);
      setSelectedGrade(grade);
      const message = err instanceof Error ? err.message : "Submit failed";
      showToast(
        message.toLowerCase() === "unauthorized"
          ? "Session expired. Reopen the WebApp."
          : message,
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }, [card, selectedGrade, submitting, remainingDue, startTime, loadNextCard, showToast]);

  useEffect(() => {
    initTelegram(() => window.Telegram?.WebApp?.close());
    loadNextCard();
    return () => {
      teardownTelegram();
    };
  }, [loadNextCard]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!showAnswer || submitting) return;
      const grade = KEY_TO_GRADE[event.key];
      if (grade !== undefined && card) {
        event.preventDefault();
        setSelectedGrade(grade);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [card, showAnswer, submitting]);

  useEffect(() => {
    if (card && showAnswer && selectedGrade !== null) {
      configureMainButton({
        text: `Submit – ${gradeLabel(selectedGrade)}`,
        onClick: handleSubmit,
        disabled: submitting,
      });
    } else {
      hideMainButton();
    }
  }, [card, showAnswer, selectedGrade, submitting, handleSubmit]);

  const handleReveal = useCallback(() => {
    if (!submitting) {
      setShowAnswer(true);
    }
  }, [submitting]);

  const handleGradeSelect = useCallback(
    (grade: ReviewGrade) => {
      if (!showAnswer || submitting) {
        return;
      }
      setSelectedGrade(grade);
    },
    [showAnswer, submitting],
  );

  const retry = useCallback(() => {
    loadNextCard();
  }, [loadNextCard]);

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>Practice</h1>
          {totalDue > 0 && (
            <span className="app__subtitle">
              {completed} of {totalDue} reviewed
            </span>
          )}
        </div>
        <div className="app__counter">Due: {remainingDue}</div>
      </header>

      <div className="progress">
        <div className="progress__bar" style={{ width: `${progress * 100}%` }} />
      </div>

      {error && (
        <div className="error">
          <p>{error}</p>
          <button className="secondary" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {loading && !card && !error ? (
        <div className="card card--loading">
          <span className="spinner" aria-hidden />
          <p>Loading next card…</p>
        </div>
      ) : null}

      {!loading && !card && !error ? (
        <div className="card card--empty">
          <h2>All caught up! 🎉</h2>
          <p>No cards are due right now. Come back later for more practice.</p>
        </div>
      ) : null}

      {card && (
        <div className={`card ${submitting ? "card--disabled" : ""}`}>
          <div className="card__meta">
            <span>{card.queue === "new" ? "New" : card.queue}</span>
            <span>Ease {card.easeFactor.toFixed(2)}</span>
            <span>Reps {card.repetitions}</span>
          </div>
          <div className="card__front">{card.front}</div>
          {card.tags.length > 0 && (
            <div className="card__tags">
              {card.tags.map((tag) => (
                <span className="tag" key={tag}>
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {!showAnswer ? (
            <button className="primary" onClick={handleReveal} disabled={submitting}>
              Reveal answer
            </button>
          ) : (
            <>
              <div className="card__answer">{card.back}</div>
              {card.example && <div className="card__example">{card.example}</div>}
              <div className="quality-grid">
                {GRADE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    className={`quality quality--${option.tone} ${
                      selectedGrade === option.id ? "is-selected" : ""
                    }`}
                    onClick={() => handleGradeSelect(option.id)}
                    disabled={submitting}
                  >
                    <span className="quality__label">{option.label}</span>
                    <span className="quality__hint">{option.hint}</span>
                  </button>
                ))}
              </div>
              <p className="quality__help">Press 0–5 to choose a response.</p>
            </>
          )}
        </div>
      )}

      {toast && (
        <div className={`toast toast--${toast.tone}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  );
}
