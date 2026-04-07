/**
 * Shared helper functions for eval viewer components.
 */

// Format evaluator name for display.
// Handles both PascalCase ("CoverageEvaluator" -> "Coverage")
// and snake_case ("no_speaker_names" -> "No Speaker Names").
export function formatEvaluatorName(name) {
  if (name.includes("_")) {
    return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return name
    .replace("Evaluator", "")
    .replace(/([A-Z])/g, " $1")
    .trim();
}

export function formatEvaluatorShort(name) {
  return name
    .replace("Evaluator", "")
    .replace("Completeness", "")
    .replace("Distribution", "")
    .replace("Quality", "")
    .substring(0, 3);
}

export function formatPercent(value) {
  if (value === undefined || value === null) return "-";
  return `${(value * 100).toFixed(0)}%`;
}

export function getScoreClass(score) {
  if (score === undefined || score === null) return "score-unknown";
  if (score >= 0.8) return "score-high";
  if (score >= 0.5) return "score-medium";
  return "score-low";
}

export function formatDate(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString();
}
