/**
 * The assistant's user-facing name. Defined once: the UI, the nav label
 * and the system prompt all read this constant. Everything internal
 * (tables, capability and limit keys) uses the lower-case name
 * "everest" (never "assistant": the customer-facing chatbot already owns that name), so renaming it later is a one-line change here.
 */
export const EVEREST_NAME = "Everest";
