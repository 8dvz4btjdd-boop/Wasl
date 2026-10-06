-- Audit-created synthetic reproduction. This is NOT a repository test.
-- Run only on the labelled local audit DB after applying unmodified 0001–0018.
-- All application/auth rows are rolled back; no private text is printed.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email, role, is_anonymous) values
 ('aaaaaaaa-0000-4000-8000-000000000001','audit-admin@example.invalid','authenticated',false),
 ('aaaaaaaa-0000-4000-8000-000000000002','audit-daee1@example.invalid','authenticated',false),
 ('aaaaaaaa-0000-4000-8000-000000000003','audit-daee2@example.invalid','authenticated',false),
 ('aaaaaaaa-0000-4000-8000-000000000004','audit-foreign-daee@example.invalid','authenticated',false),
 ('aaaaaaaa-0000-4000-8000-000000000005','audit-asker1@example.invalid','authenticated',true),
 ('aaaaaaaa-0000-4000-8000-000000000006','audit-asker2@example.invalid','authenticated',true);
insert into organizations(id,name,ai_enabled) values
 ('aaaaaaaa-0000-4000-8000-000000000010','AUDIT SYNTHETIC A',false),
 ('aaaaaaaa-0000-4000-8000-000000000011','AUDIT SYNTHETIC B',false);
insert into profiles(user_id,org_id,role,display_name,languages,topics,status,capacity,last_seen) values
 ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000010','admin','AUDIT ADMIN','{ar}','{}','offline',10,now()),
 ('aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000010','daee','AUDIT DAEE1','{ar}','{general}','available',10,now()),
 ('aaaaaaaa-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000010','daee','AUDIT DAEE2','{ar}','{general}','available',10,now()),
 ('aaaaaaaa-0000-4000-8000-000000000004','aaaaaaaa-0000-4000-8000-000000000011','daee','AUDIT FOREIGN DAEE','{ar}','{general}','available',10,now());
insert into askers(user_id,org_id,pseudonym,return_code_hash) values
 ('aaaaaaaa-0000-4000-8000-000000000005','aaaaaaaa-0000-4000-8000-000000000010','AUDIT ASKERA','synthetic-hash'),
 ('aaaaaaaa-0000-4000-8000-000000000006','aaaaaaaa-0000-4000-8000-000000000011','AUDIT ASKERB','synthetic-hash');
insert into intakes(id,asker_id,raw_text) values
 ('aaaaaaaa-0000-4000-8000-000000000020','aaaaaaaa-0000-4000-8000-000000000005','SYNTHETIC PRIVATE INTAKE A'),
 ('aaaaaaaa-0000-4000-8000-000000000021','aaaaaaaa-0000-4000-8000-000000000006','SYNTHETIC PRIVATE INTAKE B');
insert into conversations(id,org_id,asker_id,daee_id,intake_id,status,assigned_at,guide_summary,topic) values
 ('aaaaaaaa-0000-4000-8000-000000000030','aaaaaaaa-0000-4000-8000-000000000010','aaaaaaaa-0000-4000-8000-000000000005','aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000020','active',now()-interval '1 minute','SYNTHETIC PRIVATE GUIDE A','general'),
 ('aaaaaaaa-0000-4000-8000-000000000031','aaaaaaaa-0000-4000-8000-000000000011','aaaaaaaa-0000-4000-8000-000000000006','aaaaaaaa-0000-4000-8000-000000000004','aaaaaaaa-0000-4000-8000-000000000021','active',now()-interval '1 minute','SYNTHETIC PRIVATE GUIDE B','general');
insert into messages(id,conversation_id,sender_id,sender_role,body,created_at) values
 ('aaaaaaaa-0000-4000-8000-000000000040','aaaaaaaa-0000-4000-8000-000000000030','aaaaaaaa-0000-4000-8000-000000000005','asker','SYNTHETIC UNSELECTED OLD MESSAGE A',now()-interval '30 seconds'),
 ('aaaaaaaa-0000-4000-8000-000000000041','aaaaaaaa-0000-4000-8000-000000000031','aaaaaaaa-0000-4000-8000-000000000006','asker','SYNTHETIC FOREIGN PRIVATE MESSAGE B',now()-interval '30 seconds');

-- Current admin cannot read message bodies, but guide_summary is itself question content.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
do $$ begin
 if (select count(*) from messages where id in ('aaaaaaaa-0000-4000-8000-000000000040','aaaaaaaa-0000-4000-8000-000000000041')) <> 0 then raise exception 'admin messages block did not hold'; end if;
 if (select count(*) from conversations where guide_summary like 'SYNTHETIC PRIVATE GUIDE%') <> 2 then raise exception 'expected guide summary exposure was not reproduced'; end if;
 raise notice 'PASS control: admin message bodies blocked; PROVEN SEC-01: admin guide_summary readable across organizations';
 update organizations set name='AUDIT FOREIGN UPDATE' where id='aaaaaaaa-0000-4000-8000-000000000011';
 if (select name from organizations where id='aaaaaaaa-0000-4000-8000-000000000011') <> 'AUDIT FOREIGN UPDATE' then raise exception 'expected admin cross-org update was not reproduced'; end if;
 raise notice 'PROVEN SEC-05: organization A admin updates organization B directly';
end $$;

-- Unassigned daee denied messages yet may read both intake raw texts through direct REST.
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}';
do $$ begin
 if (select count(*) from messages where id in ('aaaaaaaa-0000-4000-8000-000000000040','aaaaaaaa-0000-4000-8000-000000000041')) <> 0 then raise exception 'unassigned message block did not hold'; end if;
 if (select count(*) from intakes where raw_text like 'SYNTHETIC PRIVATE INTAKE%') <> 2 then raise exception 'expected unassigned intake exposure was not reproduced'; end if;
 raise notice 'PASS control: unassigned daee messages blocked; PROVEN SEC-02: unassigned daee reads intake raw_text across organizations';
end $$;

-- The real authenticated handoff RPC is used, without a card. Then the receiver can
-- read the old unselected message because messages RLS has no segment boundary.
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}';
do $$ begin
 if transfer_conversation('aaaaaaaa-0000-4000-8000-000000000030','aaaaaaaa-0000-4000-8000-000000000003',false) <> 'completed' then raise exception 'real local transfer did not complete'; end if;
end $$;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}';
do $$ begin
 if (select count(*) from messages where id='aaaaaaaa-0000-4000-8000-000000000040') <> 1 then raise exception 'expected transfer archive exposure was not reproduced'; end if;
 raise notice 'PROVEN SEC-03: transferred receiver sees an old unselected message through RLS';
end $$;

-- Knowing a foreign conversation/message UUID must not be sufficient permission.
-- Own asker_id passes cards RLS; the current trigger verifies only message/conversation
-- membership; SECURITY DEFINER card_sources then reads the other asker body.
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000005","role":"authenticated"}';
insert into cards(id,conversation_id,asker_id,version,generated_by,source_message_ids,follow_up,status) values
 ('aaaaaaaa-0000-4000-8000-000000000050','aaaaaaaa-0000-4000-8000-000000000031','aaaaaaaa-0000-4000-8000-000000000005',80001,'manual','{aaaaaaaa-0000-4000-8000-000000000041}','SYNTHETIC MALICIOUS OWN CARD','draft');
do $$ begin
 if (select count(*) from card_sources('aaaaaaaa-0000-4000-8000-000000000050')) <> 1 then raise exception 'foreign card_sources leak was not reproduced'; end if;
 raise notice 'PROVEN SEC-04: known foreign UUIDs in own draft bypass conversation ownership via card_sources';
end $$;

-- Positive consent controls: valid own draft remains invisible, content immutable
-- after approval; expired card and a newly edited draft do not become visible.
insert into cards(id,conversation_id,asker_id,version,generated_by,source_message_ids,follow_up,status,visibility) values
 ('aaaaaaaa-0000-4000-8000-000000000051','aaaaaaaa-0000-4000-8000-000000000030','aaaaaaaa-0000-4000-8000-000000000005',80001,'manual','{aaaaaaaa-0000-4000-8000-000000000040}','SYNTHETIC VALID CARD','draft','team');
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}';
do $$ begin
 if (select count(*) from cards where id='aaaaaaaa-0000-4000-8000-000000000051') <> 0 then raise exception 'draft leaked'; end if;
 raise notice 'PASS control: daee cannot see draft before approval';
end $$;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000005","role":"authenticated"}';
update cards set status='approved', approved_at=now() where id='aaaaaaaa-0000-4000-8000-000000000051';
do $$ begin
 begin
  update cards set follow_up='SYNTHETIC ILLEGAL MUTATION' where id='aaaaaaaa-0000-4000-8000-000000000051';
  raise exception 'approved content mutation succeeded';
 exception when others then
  if sqlerrm <> 'an approved card is immutable; save a new version' then raise; end if;
 end;
 raise notice 'PASS control: approved text mutation blocked by DB trigger';
 begin
  update cards set source_message_ids='{}' where id='aaaaaaaa-0000-4000-8000-000000000051';
  raise exception 'approved selected IDs mutation succeeded';
 exception when others then
  if sqlerrm <> 'an approved card is immutable; save a new version' then raise; end if;
 end;
 begin
  update cards set visibility='this_daee', accept_substitute=false where id='aaaaaaaa-0000-4000-8000-000000000051';
  raise exception 'approved privacy flags mutation succeeded';
 exception when others then
  if sqlerrm <> 'an approved card is immutable; save a new version' then raise; end if;
 end;
 raise notice 'PASS control: approved selected IDs and sharing flags immutable';
end $$;
insert into cards(id,conversation_id,asker_id,version,generated_by,source_message_ids,follow_up,status,visibility) values
 ('aaaaaaaa-0000-4000-8000-000000000052','aaaaaaaa-0000-4000-8000-000000000030','aaaaaaaa-0000-4000-8000-000000000005',80002,'manual','{aaaaaaaa-0000-4000-8000-000000000040}','SYNTHETIC NEW DRAFT','draft','team');
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}';
do $$ begin
 if (select count(*) from cards where id='aaaaaaaa-0000-4000-8000-000000000051') <> 1 then raise exception 'approved team card missing'; end if;
 if (select count(*) from cards where id='aaaaaaaa-0000-4000-8000-000000000052') <> 0 then raise exception 'edited draft leaked'; end if;
 raise notice 'PASS control: latest draft hidden while prior approved version remains';
end $$;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000005","role":"authenticated"}';
update cards set expires_at=now()-interval '1 second' where id='aaaaaaaa-0000-4000-8000-000000000051';
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}';
do $$ begin
 if (select count(*) from cards where id='aaaaaaaa-0000-4000-8000-000000000051') <> 0 then raise exception 'expired card visible'; end if;
 raise notice 'PASS control: expired card not visible';
end $$;
-- Relationship keys are not in the immutable comparison. A direct own card with
-- no selected IDs can be moved to another asker's conversation after approval.
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000005","role":"authenticated"}';
insert into cards(id,conversation_id,asker_id,version,generated_by,follow_up,status) values
 ('aaaaaaaa-0000-4000-8000-000000000053','aaaaaaaa-0000-4000-8000-000000000030','aaaaaaaa-0000-4000-8000-000000000005',80003,'manual','SYNTHETIC EMPTY-SOURCES CARD','draft');
update cards set status='approved',approved_at=now() where id='aaaaaaaa-0000-4000-8000-000000000053';
update cards set conversation_id='aaaaaaaa-0000-4000-8000-000000000031' where id='aaaaaaaa-0000-4000-8000-000000000053';
do $$ begin
 if (select conversation_id from cards where id='aaaaaaaa-0000-4000-8000-000000000053') <> 'aaaaaaaa-0000-4000-8000-000000000031' then raise exception 'expected approved relationship mutation was not reproduced'; end if;
 raise notice 'PROVEN SEC-04 companion: approved empty-source card conversation_id remains client-mutable';
end $$;

-- Ban control at the DB/RLS layer. This models still-accepted authenticated claims,
-- not a claim that a fresh Auth login by a banned account succeeds.
reset role;
update auth.users set banned_until=now()+interval '1 hour' where id='aaaaaaaa-0000-4000-8000-000000000003';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}';
do $$ begin
 if me_active() then raise exception 'ban fixture not active'; end if;
 if (select count(*) from messages where id='aaaaaaaa-0000-4000-8000-000000000040') <> 0 then raise exception 'banned message RLS block did not hold'; end if;
 if (select count(*) from intakes where raw_text like 'SYNTHETIC PRIVATE INTAKE%') <> 2 then raise exception 'expected banned intake exposure was not reproduced'; end if;
 perform end_conversation('aaaaaaaa-0000-4000-8000-000000000030');
 raise notice 'PASS control: banned message read blocked; PROVEN SEC-02/09 with accepted DB claims: intake read and end_conversation still allowed';
end $$;
reset role;
rollback;
