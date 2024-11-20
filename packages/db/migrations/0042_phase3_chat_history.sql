CREATE FUNCTION hsm_chat_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Referenced chat history cannot be removed' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'chat_messages' THEN
    IF (to_jsonb(NEW) - ARRAY['deleted_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['deleted_at'])
      OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
      RAISE EXCEPTION 'Message history is immutable' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'conversations' THEN
    IF (to_jsonb(NEW) - ARRAY['last_message_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['last_message_at'])
      OR (OLD.last_message_at IS NOT NULL AND (NEW.last_message_at IS NULL OR NEW.last_message_at < OLD.last_message_at)) THEN
      RAISE EXCEPTION 'Conversation identity and history are immutable' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Chat attachment history is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER chat_messages_history BEFORE UPDATE OR DELETE ON chat_messages FOR EACH ROW EXECUTE FUNCTION hsm_chat_history_guard();
--> statement-breakpoint
CREATE TRIGGER chat_messages_no_truncate BEFORE TRUNCATE ON chat_messages FOR EACH STATEMENT EXECUTE FUNCTION hsm_chat_history_guard();
--> statement-breakpoint
CREATE TRIGGER conversations_history BEFORE UPDATE OR DELETE ON conversations FOR EACH ROW EXECUTE FUNCTION hsm_chat_history_guard();
--> statement-breakpoint
CREATE TRIGGER conversations_no_truncate BEFORE TRUNCATE ON conversations FOR EACH STATEMENT EXECUTE FUNCTION hsm_chat_history_guard();
--> statement-breakpoint
CREATE TRIGGER chat_attachments_history BEFORE UPDATE OR DELETE OR TRUNCATE ON chat_attachments FOR EACH STATEMENT EXECUTE FUNCTION hsm_chat_history_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_chat_message_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; message chat_messages%ROWTYPE; file_count integer; customer uuid;
BEGIN
  IF TG_TABLE_NAME = 'chat_messages' THEN target := NEW.id; ELSE target := NEW.message_id; END IF;
  SELECT * INTO message FROM chat_messages WHERE id = target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*) INTO file_count FROM chat_attachments WHERE message_id = target;
  IF (message.body IS NULL AND file_count = 0) OR file_count > 5 THEN
    RAISE EXCEPTION 'Message requires bounded content' USING ERRCODE = '23514';
  END IF;
  SELECT customer_user_id INTO customer FROM conversations WHERE id = message.conversation_id;
  IF message.sender_side = 'customer' AND message.sender_user_id IS DISTINCT FROM customer THEN
    RAISE EXCEPTION 'Customer message source mismatch' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM chat_attachments a JOIN files f ON f.id = a.file_id
    WHERE a.message_id = target AND (f.uploaded_by IS DISTINCT FROM message.sender_user_id
      OR f.purpose <> 'chat_attachment' OR f.visibility <> 'private' OR f.scan_status <> 'clean'
      OR f.mime_type NOT IN ('image/jpeg','image/png','application/pdf')
      OR f.size_bytes > 10000000 OR f.sha256 IS NULL OR octet_length(f.sha256) <> 32
      OR f.object_key NOT LIKE 'private/chat_attachment/' || f.id::text || '/%')) THEN
    RAISE EXCEPTION 'Attachment source unavailable' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER chat_messages_integrity AFTER INSERT ON chat_messages DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_chat_message_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER chat_attachments_integrity AFTER INSERT ON chat_attachments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_chat_message_integrity();
