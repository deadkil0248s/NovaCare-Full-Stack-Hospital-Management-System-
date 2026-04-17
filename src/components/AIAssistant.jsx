import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const WELCOME = {
  role: "assistant",
  content:
    "Hi! I'm MediZyra's health assistant. Tell me what symptoms or concerns you're experiencing and I'll help you find the right specialist and guide your appointment booking.",
};

function randomSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId] = useState(randomSessionId);
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [recommendation, setRecommendation] = useState(null);
  const [error, setError] = useState("");
  const messagesRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Scroll the messages container itself — NOT the page
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [isOpen]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);
    setError("");

    // Build the API payload — exclude the local welcome message
    const apiMessages = updatedMessages.filter((m) => m !== WELCOME);

    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, sessionId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Request failed");
      }

      const data = await res.json();

      // Strip markdown bold/italic markers so they don't show as raw symbols
      const cleanMessage = data.message
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .trim();
      setMessages((prev) => [...prev, { role: "assistant", content: cleanMessage }]);

      if (data.recommendation) {
        setRecommendation(data.recommendation);
      }
    } catch (err) {
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleBookNow() {
    navigate(`/doctors/${recommendation.doctorId}`, {
      state: {
        aiPrefill: {
          consultMode: recommendation.consultMode,
          priority: recommendation.priority,
          reason: recommendation.reasonForVisit,
          symptoms: recommendation.suggestedSymptoms,
        },
      },
    });
    setIsOpen(false);
  }

  function handleClose() {
    setIsOpen(false);
  }

  const priorityClass =
    recommendation?.priority === "Emergency"
      ? "ai-priority-emergency"
      : recommendation?.priority === "Urgent"
        ? "ai-priority-urgent"
        : "ai-priority-routine";

  return (
    <>
      <button
        aria-label="Open health assistant"
        className="ai-trigger"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        <span className="ai-trigger-icon">✦</span>
        <span>Health Assistant</span>
      </button>

      {isOpen && (
        <div className="ai-panel" role="dialog" aria-label="MediZyra Health Assistant">
          {/* Header */}
          <div className="ai-panel-header">
            <div className="ai-panel-avatar">
              <span>🩺</span>
            </div>
            <div className="ai-panel-title-group">
              <div className="ai-panel-title">MediZyra Health Assistant</div>
              <div className="ai-panel-subtitle">
                <span className="ai-panel-dot" />
                <span>Online · Powered by Gemini AI</span>
              </div>
            </div>
            <button
              aria-label="Close assistant"
              className="ai-close-btn"
              type="button"
              onClick={handleClose}
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="ai-messages" ref={messagesRef}>
            {messages.map((msg, i) => (
              <div key={i} className={`ai-msg-row ai-msg-row-${msg.role}`}>
                {msg.role === "assistant" && (
                  <div className="ai-msg-avatar">🩺</div>
                )}
                <div className="ai-msg-wrapper">
                  <span className={`ai-msg-label ai-msg-label-${msg.role}`}>
                    {msg.role === "user" ? "You" : "MediZyra AI"}
                  </span>
                  <div className={`ai-bubble ai-bubble-${msg.role}`}>
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="ai-msg-row ai-msg-row-assistant">
                <div className="ai-msg-avatar">🩺</div>
                <div className="ai-msg-wrapper">
                  <span className="ai-msg-label ai-msg-label-assistant">MediZyra AI</span>
                  <div className="ai-bubble ai-bubble-assistant ai-typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            )}

            {error && <div className="ai-error">{error}</div>}
          </div>

          {/* Recommendation card */}
          {recommendation && (
            <div className={`ai-rec-card ${priorityClass}`}>
              <p className="ai-rec-label">Recommended specialist</p>
              <p className="ai-rec-name">{recommendation.doctorName}</p>
              <p className="ai-rec-specialty">{recommendation.specialty}</p>
              <div className="ai-rec-badges">
                <span className="ai-badge">{recommendation.consultMode}</span>
                <span className={`ai-badge ai-badge-priority ${priorityClass}`}>
                  {recommendation.priority}
                </span>
              </div>
              <button className="ai-book-btn" type="button" onClick={handleBookNow}>
                Book this doctor →
              </button>
            </div>
          )}

          {/* Input */}
          <div className="ai-input-row">
            <textarea
              ref={inputRef}
              className="ai-input"
              disabled={isLoading}
              placeholder="Describe your symptoms..."
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              className="ai-send-btn"
              disabled={isLoading || !input.trim()}
              type="button"
              onClick={sendMessage}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}
