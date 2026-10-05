/**
 * Seeds default categories for a new user on first sign-in.
 */

const DEFAULT_CATEGORIES = [
  { name: "Food & Drink",  colour: "#E87040" },
  { name: "Transport",     colour: "#3B82F6" },
  { name: "Shopping",      colour: "#8B5CF6" },
  { name: "Bills",         colour: "#6B7280" },
  { name: "Health",        colour: "#10B981" },
  { name: "Entertainment", colour: "#F59E0B" },
  { name: "Travel",        colour: "#EC4899" },
  { name: "Other",         colour: "#9CA3AF" },
]

onModelAfterCreate((e) => {
  const userId = e.model.id

  // Check if categories already exist for this user (idempotent)
  const existing = $app.dao().findRecordsByFilter("categories", `owner = "${userId}"`, "", 1, 0)
  if (existing.length > 0) return

  const col = $app.dao().findCollectionByNameOrId("categories")
  for (const cat of DEFAULT_CATEGORIES) {
    const record = new Record(col)
    record.set("owner", userId)
    record.set("name", cat.name)
    record.set("colour", cat.colour)
    record.set("archived", false)
    $app.dao().saveRecord(record)
  }

  // Seed default settings
  const settingsCol = $app.dao().findCollectionByNameOrId("settings")
  const settingsRecord = new Record(settingsCol)
  settingsRecord.set("owner", userId)
  settingsRecord.set("enabled_currencies", ["AED", "USD", "GBP", "INR"])
  settingsRecord.set("default_currency", "AED")
  settingsRecord.set("date_format", "dd MMM yyyy")
  settingsRecord.set("number_format", "en")
  $app.dao().saveRecord(settingsRecord)

}, "_pb_users_auth_")
