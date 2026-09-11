-- Database enforcement supplements request-level authorization and validation.
CREATE TRIGGER record_insert_integrity BEFORE INSERT ON records BEGIN
 SELECT CASE WHEN NEW.branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM branches WHERE id=NEW.branch_id AND company_id=NEW.company_id AND division_id=NEW.division_id) THEN RAISE(ABORT,'record_branch_ownership') END;
 SELECT CASE WHEN NEW.division_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM divisions WHERE id=NEW.division_id AND company_id=NEW.company_id) THEN RAISE(ABORT,'record_division_ownership') END;
 SELECT CASE WHEN NEW.no_activity NOT IN (0,1) OR (NEW.no_activity=1 AND (NEW.kind!='sale' OR NEW.amount_minor!=0)) OR (NEW.no_activity=0 AND NEW.amount_minor=0) THEN RAISE(ABORT,'record_no_activity') END;
 SELECT CASE WHEN NEW.end_date IS NOT NULL AND NEW.end_date<NEW.business_date THEN RAISE(ABORT,'record_period_order') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM companies WHERE id=NEW.company_id AND closed_through>=NEW.business_date) THEN RAISE(ABORT,'record_period_closed') END;
 SELECT CASE WHEN NEW.supersedes_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM records original WHERE original.id=NEW.supersedes_id AND original.status='approved' AND original.company_id=NEW.company_id AND original.division_id IS NEW.division_id AND original.branch_id IS NEW.branch_id AND original.kind=NEW.kind) THEN RAISE(ABORT,'correction_original_changed') END;
END;
--> statement-breakpoint
CREATE TRIGGER record_update_integrity BEFORE UPDATE ON records BEGIN
 SELECT CASE WHEN NEW.branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM branches WHERE id=NEW.branch_id AND company_id=NEW.company_id AND division_id=NEW.division_id) THEN RAISE(ABORT,'record_branch_ownership') END;
 SELECT CASE WHEN NEW.division_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM divisions WHERE id=NEW.division_id AND company_id=NEW.company_id) THEN RAISE(ABORT,'record_division_ownership') END;
 SELECT CASE WHEN NEW.no_activity NOT IN (0,1) OR (NEW.no_activity=1 AND (NEW.kind!='sale' OR NEW.amount_minor!=0)) OR (NEW.no_activity=0 AND NEW.amount_minor=0) THEN RAISE(ABORT,'record_no_activity') END;
 SELECT CASE WHEN NEW.end_date IS NOT NULL AND NEW.end_date<NEW.business_date THEN RAISE(ABORT,'record_period_order') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM companies WHERE (id=NEW.company_id AND closed_through>=NEW.business_date) OR (id=OLD.company_id AND closed_through>=OLD.business_date)) THEN RAISE(ABORT,'record_period_closed') END;
 SELECT CASE WHEN (NEW.company_id IS NOT OLD.company_id OR NEW.division_id IS NOT OLD.division_id OR NEW.branch_id IS NOT OLD.branch_id) AND EXISTS(SELECT 1 FROM record_documents WHERE record_id=OLD.id) THEN RAISE(ABORT,'evidence_scope_locked') END;
 SELECT CASE WHEN OLD.status IN ('approved','superseded','voided') AND (NEW.company_id IS NOT OLD.company_id OR NEW.division_id IS NOT OLD.division_id OR NEW.branch_id IS NOT OLD.branch_id OR NEW.kind IS NOT OLD.kind OR NEW.title IS NOT OLD.title OR NEW.business_date IS NOT OLD.business_date OR NEW.end_date IS NOT OLD.end_date OR NEW.amount_minor IS NOT OLD.amount_minor OR NEW.currency IS NOT OLD.currency OR NEW.category IS NOT OLD.category OR NEW.purpose IS NOT OLD.purpose OR NEW.counterparty IS NOT OLD.counterparty OR NEW.source_reference IS NOT OLD.source_reference OR NEW.details IS NOT OLD.details OR NEW.scope_snapshot IS NOT OLD.scope_snapshot OR NEW.related_id IS NOT OLD.related_id OR NEW.no_activity IS NOT OLD.no_activity OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at) THEN RAISE(ABORT,'approved_facts_immutable') END;
 SELECT CASE WHEN OLD.status IN ('superseded','voided') OR (OLD.status='approved' AND NEW.status NOT IN ('superseded','voided')) THEN RAISE(ABORT,'approved_status_immutable') END;
 SELECT CASE WHEN NEW.status='approved' AND (NEW.approved_at IS NULL OR NEW.approved_by IS NULL OR NEW.approved_by=NEW.created_by) THEN RAISE(ABORT,'approval_identity_required') END;
 SELECT CASE WHEN NEW.status='approved' AND NEW.kind='sale' AND EXISTS(SELECT 1 FROM records other WHERE other.id!=NEW.id AND other.id IS NOT NEW.supersedes_id AND other.status='approved' AND other.kind='sale' AND other.company_id=NEW.company_id AND other.division_id IS NEW.division_id AND other.branch_id IS NEW.branch_id AND other.currency=NEW.currency AND other.business_date<=COALESCE(NEW.end_date,NEW.business_date) AND COALESCE(other.end_date,other.business_date)>=NEW.business_date) THEN RAISE(ABORT,'overlapping_sales_period') END;
END;
--> statement-breakpoint
CREATE TRIGGER record_no_delete BEFORE DELETE ON records BEGIN SELECT RAISE(ABORT,'record_history_must_be_preserved'); END;
--> statement-breakpoint
CREATE TRIGGER branch_ownership BEFORE INSERT ON branches BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM divisions WHERE id=NEW.division_id AND company_id=NEW.company_id) THEN RAISE(ABORT,'branch_parent_mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER branch_parent_immutable BEFORE UPDATE ON branches WHEN NEW.company_id IS NOT OLD.company_id OR NEW.division_id IS NOT OLD.division_id BEGIN SELECT RAISE(ABORT,'branch_parent_history_protected'); END;
--> statement-breakpoint
CREATE TRIGGER division_parent_immutable BEFORE UPDATE ON divisions WHEN NEW.company_id IS NOT OLD.company_id BEGIN SELECT RAISE(ABORT,'division_parent_history_protected'); END;
--> statement-breakpoint
CREATE TRIGGER document_ownership BEFORE INSERT ON documents BEGIN
 SELECT CASE WHEN NEW.division_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM divisions WHERE id=NEW.division_id AND company_id=NEW.company_id) THEN RAISE(ABORT,'document_division_ownership') END;
 SELECT CASE WHEN NEW.branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM branches WHERE id=NEW.branch_id AND company_id=NEW.company_id AND division_id=NEW.division_id) THEN RAISE(ABORT,'document_branch_ownership') END;
END;
--> statement-breakpoint
CREATE TRIGGER evidence_scope_integrity BEFORE INSERT ON record_documents BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM records r JOIN documents d ON d.id=NEW.document_id WHERE r.id=NEW.record_id AND r.status NOT IN ('superseded','voided') AND r.company_id IS d.company_id AND r.division_id IS d.division_id AND r.branch_id IS d.branch_id) THEN RAISE(ABORT,'evidence_scope_mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER document_original_immutable BEFORE UPDATE ON documents BEGIN SELECT RAISE(ABORT,'document_original_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'audit_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'audit_history_immutable'); END;
