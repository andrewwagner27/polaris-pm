-- 20261114000000_agent_knowledge.sql
-- Agent Center: management-approved AI knowledge (Teach Agent) and an append-only escalation history.
--
--   public.agent_knowledge          Answers management has approved for the tenant AI, scoped to all properties,
--                                   one property, or one unit. Only landlords can read or write them. The API reads
--                                   them with the service role and gives a tenant only the entries for their own
--                                   property and unit. Entries are never edited: to change one, retire it and
--                                   approve a new one, so what the AI was told stays auditable.
--   public.agent_escalation_events  resolved / reopened / knowledge_added / note events on an ai_routing_logs row.
--                                   Insert-only. The current state is the latest resolved/reopened event.
--
-- Additive only: two new tables, their triggers and policies. Nothing existing is altered, and no data is written.
-- The application works without this migration: the API treats a missing table as "no approved knowledge", and the
-- Agent Center shows Teach Agent/Resolve as unavailable.
--
-- Rollback (no other object depends on these tables):
--   DROP TABLE IF EXISTS public.agent_escalation_events;
--   DROP TABLE IF EXISTS public.agent_knowledge;
--   DROP FUNCTION IF EXISTS public.agent_knowledge_guard();
--   DROP FUNCTION IF EXISTS public.agent_escalation_event_guard();

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.agent_knowledge') IS NOT NULL OR to_regclass('public.agent_escalation_events') IS NOT NULL THEN
    RAISE EXCEPTION 'agent_knowledge precondition: already applied';
  END IF;
  IF to_regprocedure('public.is_landlord()') IS NULL THEN
    RAISE EXCEPTION 'agent_knowledge precondition: public.is_landlord() is missing';
  END IF;
  IF to_regclass('public.ai_routing_logs') IS NULL OR to_regclass('public.properties') IS NULL OR to_regclass('public.units') IS NULL THEN
    RAISE EXCEPTION 'agent_knowledge precondition: ai_routing_logs, properties or units missing';
  END IF;
END $$;

CREATE TABLE public.agent_knowledge (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                 text NOT NULL CHECK (scope IN ('organization', 'property', 'unit')),
  property_id           uuid REFERENCES public.properties(id) ON DELETE RESTRICT,
  unit_id               uuid REFERENCES public.units(id) ON DELETE RESTRICT,
  topic                 text NOT NULL CHECK (char_length(btrim(topic)) BETWEEN 1 AND 80),
  content               text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 600),
  status                text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'retired')),
  source_routing_log_id uuid REFERENCES public.ai_routing_logs(id) ON DELETE SET NULL,
  approved_by           uuid NOT NULL,
  approved_at           timestamptz NOT NULL DEFAULT now(),
  retired_by            uuid,
  retired_at            timestamptz,
  CONSTRAINT agent_knowledge_scope_targets CHECK (
       (scope = 'organization' AND property_id IS NULL AND unit_id IS NULL)
    OR (scope = 'property' AND property_id IS NOT NULL AND unit_id IS NULL)
    OR (scope = 'unit' AND property_id IS NOT NULL AND unit_id IS NOT NULL)),
  CONSTRAINT agent_knowledge_retired_consistent CHECK ((status = 'retired') = (retired_at IS NOT NULL AND retired_by IS NOT NULL)),
  -- Mirrors looksLikeAccessSecret() in src/lib/agentKnowledge.js. The AI must never be given access codes.
  CONSTRAINT agent_knowledge_no_access_secrets CHECK (
        content !~* '\m(code|combo|combination|pin|password|passcode|passwd)\M[^.\n]{0,24}[0-9]{3,}'
    AND content !~* '[0-9]{3,}[^.\n]{0,20}\m(code|combo|pin|passcode)\M')
);
CREATE INDEX agent_knowledge_property_idx ON public.agent_knowledge (property_id) WHERE status = 'approved';
CREATE INDEX agent_knowledge_unit_idx ON public.agent_knowledge (unit_id) WHERE status = 'approved';
CREATE INDEX agent_knowledge_source_idx ON public.agent_knowledge (source_routing_log_id);

-- Inserts: approved_by is the signed-in landlord (cannot be claimed for someone else); a unit must belong to the
-- property given. Updates: only approved -> retired, by the signed-in user, with nothing else changed.
-- SECURITY DEFINER so the unit/property consistency check reads units regardless of the caller's own grants or RLS.
CREATE FUNCTION public.agent_knowledge_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.approved_by := COALESCE(auth.uid(), NEW.approved_by);
    NEW.approved_at := now();
    IF NEW.approved_by IS NULL THEN RAISE EXCEPTION 'agent_knowledge: approved_by is required'; END IF;
    IF NEW.status <> 'approved' THEN RAISE EXCEPTION 'agent_knowledge: new entries must be approved'; END IF;
    IF NEW.scope = 'unit' THEN
      IF NOT EXISTS (SELECT 1 FROM public.units u WHERE u.id = NEW.unit_id AND u.property_id = NEW.property_id) THEN
        RAISE EXCEPTION 'agent_knowledge: unit does not belong to the property';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'approved' OR NEW.status <> 'retired'
     OR (NEW.id, NEW.scope, NEW.property_id, NEW.unit_id, NEW.topic, NEW.content, NEW.source_routing_log_id, NEW.approved_by, NEW.approved_at)
        IS DISTINCT FROM (OLD.id, OLD.scope, OLD.property_id, OLD.unit_id, OLD.topic, OLD.content, OLD.source_routing_log_id, OLD.approved_by, OLD.approved_at) THEN
    RAISE EXCEPTION 'agent_knowledge: entries cannot be edited, only retired';
  END IF;
  NEW.retired_by := COALESCE(auth.uid(), NEW.retired_by);
  NEW.retired_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER agent_knowledge_guard BEFORE INSERT OR UPDATE ON public.agent_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.agent_knowledge_guard();

CREATE TABLE public.agent_escalation_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_log_id uuid NOT NULL REFERENCES public.ai_routing_logs(id) ON DELETE RESTRICT,
  event          text NOT NULL CHECK (event IN ('resolved', 'reopened', 'knowledge_added', 'note')),
  note           text CHECK (note IS NULL OR char_length(note) <= 2000),
  knowledge_id   uuid REFERENCES public.agent_knowledge(id) ON DELETE RESTRICT,
  actor_id       uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_escalation_events_knowledge CHECK ((event = 'knowledge_added') = (knowledge_id IS NOT NULL))
);
CREATE INDEX agent_escalation_events_log_idx ON public.agent_escalation_events (routing_log_id, created_at);

CREATE FUNCTION public.agent_escalation_event_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.actor_id := COALESCE(auth.uid(), NEW.actor_id);
  NEW.created_at := now();
  IF NEW.actor_id IS NULL THEN RAISE EXCEPTION 'agent_escalation_events: actor_id is required'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_escalation_event_guard BEFORE INSERT ON public.agent_escalation_events
  FOR EACH ROW EXECUTE FUNCTION public.agent_escalation_event_guard();

-- Row-level security: landlords only. No DELETE policy on either table; no UPDATE on the event history.
ALTER TABLE public.agent_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_escalation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Landlord reads agent knowledge"    ON public.agent_knowledge FOR SELECT TO authenticated USING (public.is_landlord());
CREATE POLICY "Landlord approves agent knowledge" ON public.agent_knowledge FOR INSERT TO authenticated WITH CHECK (public.is_landlord());
CREATE POLICY "Landlord retires agent knowledge"  ON public.agent_knowledge FOR UPDATE TO authenticated USING (public.is_landlord()) WITH CHECK (public.is_landlord());

CREATE POLICY "Landlord reads escalation events"  ON public.agent_escalation_events FOR SELECT TO authenticated USING (public.is_landlord());
CREATE POLICY "Landlord records escalation events" ON public.agent_escalation_events FOR INSERT TO authenticated WITH CHECK (public.is_landlord());

REVOKE ALL ON public.agent_knowledge, public.agent_escalation_events FROM anon;
REVOKE ALL ON public.agent_knowledge, public.agent_escalation_events FROM authenticated;
GRANT SELECT, INSERT ON public.agent_knowledge, public.agent_escalation_events TO authenticated;
GRANT UPDATE (status, retired_by, retired_at) ON public.agent_knowledge TO authenticated;
GRANT ALL ON public.agent_knowledge, public.agent_escalation_events TO service_role;

COMMIT;
