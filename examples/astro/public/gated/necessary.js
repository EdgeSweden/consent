// Stands in for a third-party script of the necessary category: lists itself on the page when the
// script-gating adapter activates it (plan: Demo). A block, since classic scripts share one scope.
/* global document */
{
  const item = document.createElement("li");
  item.textContent = "necessary";
  document.getElementById("gated-scripts")?.append(item);
}
