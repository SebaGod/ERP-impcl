-- =============================================================
-- Plataforma v2 · Agentes IA más capaces
-- Instrucciones estructuradas + base de conocimiento.
-- Additivo: agrega columnas a ai_agents y una tabla nueva.
-- =============================================================

alter table public.ai_agents
  add column personality text not null default '',
  add column additional_info text not null default '';

create table public.ai_agent_knowledge (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  ai_agent_id uuid not null references public.ai_agents (id) on delete cascade,
  title text not null,
  content text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index ai_agent_knowledge_agent_idx on public.ai_agent_knowledge (ai_agent_id);

alter table public.ai_agent_knowledge enable row level security;
create policy "members read knowledge" on public.ai_agent_knowledge
  for select using (app.is_member(org_id));
create policy "admins manage knowledge" on public.ai_agent_knowledge
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));
