# CRM Automations Module

Configurable multi-tenant automations for Hexalyte Salon WhatsApp AI CRM.

## Menu

**CRM → Automations** (`/crm/automations`)

## What it reuses (does not duplicate)

| Automation | Existing system |
|------------|-----------------|
| Appointment Reminder (1 day) | `crmReminderService.runDayBeforeReminders` + FOLLOWUP queue |
| Abandoned Booking | `crmReminderService.runAbandonedBookingNudges` |
| WhatsApp Cloud sends | `whatsappCloudService` |
| SMS / Email / Twilio WA | `notificationService` |
| Jobs | BullMQ `FOLLOWUP` queue + `aiCrmWorker` |
| Audit | `CrmAuditLog` |
| Feature gate | `whatsapp_ai_crm` |

## Types

1. `appointment_reminder` — 1 day (legacy) or 2 hours before  
2. `welcome_message` — on customer registration (hook in `customerController`)  
3. `birthday_wishes` — DOB today, ~09:00 tick  
4. `review_request` — completed appointments + delay  
5. `rebooking_reminder` — inactive 30/60/90 days  
6. `abandoned_booking` — wraps existing abandoned nudges  
7. `promotional_campaign` — manual segment send  

## APIs

All under `/api/crm/automations*` — JWT + admin/superadmin + `featureGate('whatsapp_ai_crm')`.

| Method | Path |
|--------|------|
| GET | `/automations/dashboard` |
| GET | `/automations` |
| POST | `/automations` |
| GET | `/automations/:id` |
| PUT | `/automations/:id` |
| DELETE | `/automations/:id` (catalog rows are disabled, not hard-deleted) |
| POST | `/automations/:id/run` |
| GET | `/automations/history` |

## Database

- `crm_automations` — `CrmAutomation`  
- `crm_automation_executions` — `CrmAutomationExecution`  

Every row includes `tenant_id`. Tables are created via Sequelize sync with the rest of CRM models.

## Workers

`FOLLOWUP` jobs:

- Existing: `day_before_reminders`, `abandoned_nudges`  
- New: `automation_run` (manual Run Now), `automation_tick` (hourly schedule for birthday / review / rebook)  

Legacy day-before / abandoned runners **skip a tenant** when that automation type is disabled.

## Frontend

`frontend/src/pages/crm/CrmAutomationsPage.jsx`

- Dashboard metrics  
- Automation cards (ON/OFF, Edit, Run Now, History)  
- Settings modal (channel, delay, template, segment)  
- Execution history table  

## Tests

```bash
cd backend
node --test tests/crmAutomations.test.js
```

## Security

- Tenant scoped via `resolveTenantId`  
- Feature gate `whatsapp_ai_crm`  
- Audit actions: `automation_created|updated|disabled|deleted|run_enqueued`  
