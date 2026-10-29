# Platform data sources (real, read-only)

Generated 2026-10-28 from read-only probes (D-122): `BEGIN READ ONLY`, `default_transaction_read_only=on`, TLS verified
against the AWS RDS CA bundle. Contents: schema, planner row **estimates** (`pg_class.reltuples`) and the test users'
row **counts**. No row values are recorded here.

Identity join: the platform `users.id` (UUID) is the VC `studentId`. In Vidysea, `students.id = users.id` (1:1). In
Pathlynks, student-owned tables reference `users.id` directly (`student_id` / `user_id`).

## Pathlynks (`pathlynks_prod_121125`)

332 tables, 253 foreign keys.

### Tables VC reads today (`config/sources.json`)

| Table | Est. rows | Columns |
|---|---|---|
| `users` | 13581 | id:uuid, first_name:character varying, last_name:character varying, email:character varying, email_verified_at:timestamp with time zone, mobile:character varying, mobile_verified_at:timestamp with time zone, provider:character varying, password_digest:character varying, created_at:timestamp without time zone, updated_at:timestamp without time zone, registered_at:timestamp with time zone, disabled_at:timestamp with time zone, forgot_password:boolean, nationality:character varying, date_of_birth:timestamp with time zone, preferences:jsonb, profile_picture_url:character varying, name:text, designation:text, otp:integer, student_id:character varying, student_user_id:character varying, google_id:character varying, status:smallint, deleted_at:timestamp with time zone, organization:character varying, bio:text, usertype:character, payment_gateway:smallint, retailer_school_name:character varying, boards:ARRAY, zoho_lead_id:character varying, subject_selection_summary:jsonb, is_deleted:boolean, current_board:integer, session_count:integer, must_change_password:boolean, gender:character varying, show_word_count:boolean, heard_about_us:character varying, heard_about_us_detail:character varying, parent_onboarding_deferred_at:timestamp with time zone, heard_about_us_school_id:integer |
| `user_grade` | 10237 | id:integer, user_id:uuid, grade_id:integer, created_date:timestamp without time zone, modified_date:timestamp without time zone, status:integer, grade_section_id:integer, grade_status:USER-DEFINED, promoted_at:timestamp with time zone, previous_student_user_id:character varying, promoted_in_at:timestamp with time zone, promotion_ack_at:timestamp with time zone |
| `grade` | 9 | id:integer, name:character varying, created_date:timestamp without time zone, modified_date:timestamp without time zone, status:integer, deleted_at:timestamp with time zone, grade_no:smallint, grade_name_ib:character varying, grade_name_cambridge:character varying |
| `student_saved_careers` | 130 | student_id:uuid, id:integer, created_at:timestamp with time zone, updated_at:timestamp with time zone, save_type:character varying |
| `student_career_compare` | 16 | student_id:uuid, career_id:integer, slot:smallint, created_at:timestamp with time zone |
| `career_option` | 59007 | id:integer, preferred_label:text, short_description:character varying, long_description:text, career_type:character varying, search_tsv:tsvector, embedding:USER-DEFINED, embedding_hash:text |
| `assessment_response` | 24036 | id:integer, student_id:uuid, assessment_id:integer, created_date:timestamp without time zone, modified_date:timestamp without time zone, status:integer, detailed_report:text, email_sent:boolean, is_draft_saved:boolean, duration_stopped_at:text, assessment_schedule_id:integer, language_id:integer, combined_report:text, grade_id:integer |

### Test user record trace

Rows owned by the test user, one FK hop from `users.id`, plus a second hop below those:

| Table.column | Rows |
|---|---|
| `public.student_section.student_id` | 6 |
| `public.assessment_response.student_id` | 4 |
| `public.user_role.user_id` | 1 |
| `public.user_access.user_id` | 14 |
| `public.user_school.user_id` | 1 |
| `public.user_grade.user_id` | 1 |
| `public.user_discount_coupons.user_id` | 1 |
| `public.student_package.student_id` | 1 |
| `public.academic_report.student_id` | 1 |
| `public.category_judge_model.student_id` | 1 |
| `public.assessment_response_question.assessment_response_id` (via `public.assessment_response`) | 177 |
| `public.assessment_report_scoring.assessment_response_id` (via `public.assessment_response`) | 28 |
| `public.academic_report_details.report_id` (via `public.academic_report`) | 6 |
| `public.category_judge_model_detail.category_judge_model_id` (via `public.category_judge_model`) | 6 |

### Other counselling-relevant tables (name match, top 40 by size)

| Table | Est. rows | Columns |
|---|---|---|
| `public.career_cost` | 1180160 | id:integer, career_id:integer, country_id:integer, min_cost:integer, max_cost:integer |
| `public.career_countrywise_wages` | 1180140 | career_id:integer, country_id:integer, fresher:character varying, ten_yoe:character varying, beyond_ten_yoe:character varying, min_salary:character varying, max_salary:character varying |
| `public.career_demand` | 1180140 | id:integer, career_id:integer, country_id:integer, annual_job_openings:integer |
| `public.assessment_response_question` | 1091538 | id:integer, assessment_response_id:integer, question_id:integer, question_option_id:integer, question_option_value:text, question_option_marks:integer, created_date:timestamp without time zone, modified_date:timestamp without time zone, status:integer |
| `public.user_subcategory_fitscore` | 779140 | id:bigint, calculation_id:bigint, user_id:uuid, subcategory_id:integer, fit_score:smallint, bg_color:character varying, note:text, surity_score:character varying, answered_traits_percentage:smallint, confidence_score:numeric, top_career_ids:jsonb, created_at:timestamp without time zone, top_careers_ |
| `public.career_traitwise_score` | 758774 | career_id:integer, trait_id:integer, score:numeric, min_competency:numeric, max_competency:numeric, trait_id_1:integer, critical:smallint |
| `public.career_industry` | 373789 | id:integer, industry_name:character varying, career_id:integer |
| `public.student_trait_score_point` | 323759 | id:bigint, student_id:uuid, source_type:character varying, source_ref_id:bigint, external_report_id:bigint, assessment_response_id:bigint, assessment_id:bigint, section_id:integer, module_key:character varying, subsection_id:integer, trait_key:character varying, trait_name_raw:character varying, raw |
| `public.career_subjects` | 295035 | id:integer, career_id:integer, grade:character varying, subjects:text |
| `public.map_career_subcluster` | 292528 | id:integer, career_id:integer, subcluster_id:integer |
| `public.student_canonical_trait` | 206599 | id:bigint, profile_id:bigint, student_id:uuid, section_id:integer, module_key:character varying, subsection_id:integer, trait_key:character varying, trait_name_raw:character varying, canonical_score:numeric, seam_percentage:numeric, level:character varying, assessment_id:bigint, decision_rule:charac |
| `public.assessment_response_question_backup_06022026` | 196062 | id:integer, assessment_response_id:integer, question_id:integer, question_option_id:integer, question_option_value:text, question_option_marks:integer, created_date:timestamp without time zone, modified_date:timestamp without time zone, status:integer |
| `public.user_access` | 183385 | id:integer, user_id:uuid, menu_id:integer, created_date:timestamp without time zone, modified_date:timestamp without time zone, status:integer |
| `public.map_career_cluster` | 162660 | id:integer, career_id:integer, cluster_id:integer |
| `public.assessment_report_scoring` | 148060 | id:bigint, assessment_response_id:bigint, assessment_id:bigint, subsection_id:integer, subsection_name:character varying, marks:numeric, total_marks:numeric, average:numeric, level:character varying, sub_levels:jsonb, created_at:timestamp with time zone, updated_at:timestamp with time zone, is_valid |
| `public.map_career_subcategory` | 120149 | id:integer, career_id:integer, subcategory_id:integer, created_at:timestamp with time zone, updated_at:timestamp with time zone |
| `public.user_category_fitscore` | 112294 | id:bigint, calculation_id:bigint, user_id:uuid, category_id:integer, fit_score:smallint, bg_color:character varying, note:text, surity_score:character varying, answered_traits_percentage:smallint, confidence_score:numeric, created_at:timestamp without time zone, model_id:character varying |
| `public.student_section` | 86471 | id:integer, student_id:uuid, section_id:integer, created_date:timestamp without time zone, modified_date:timestamp without time zone, status:integer |
| `public.career_details` | 59007 | id:integer, career_id:integer, portfolio:text, project_ideas:text, similar_careers:text, notable_people:text, resources:text, work_tasks:text, alternate_titles:text, hard_skills:text, soft_skills:text, future_scope:text, futuristic_insights:text, job_security_score:text, social_status:text, growth_r |
| `public.assessment_option_change` | 42435 | id:bigint, assessment_id:bigint, question_id:bigint, option_index:integer, language_id:integer, changed_text:text, expert_id:uuid, created_date:timestamp with time zone, modified_date:timestamp with time zone, status:integer, assignment_id:bigint, approve_status:character varying, approve_user:uuid, |
| `public.school_coupon_detail` | 33664 | id:integer, school_coupon_id:integer, coupon_code:character varying, expiry_date:date, created_date:timestamp without time zone, modified_date:timestamp without time zone, status:integer, student_id:uuid, is_used:boolean, used_for:character varying, coupon_bk:text |
| `public.career` | 30498 | id:integer, preferred_label:character varying, alt_labels:character varying, median_wage:character varying, number_of_jobs:character varying, notable_people:character varying, skills_required:character varying, career_path:character varying, professional_opportunities:character varying, work_environ |
| `public.user_logs` | 25513 | id:integer, log_id:character varying, session_id:character varying, user_id:character varying, user_role:character varying, user_email:character varying, category:character varying, action:text, details:jsonb, level:character varying, timestamp:timestamp without time zone, url:text, user_agent:text, |
| `public.assessment_response_question_15092025` | 19166 | id:integer, assessment_response_id:integer, question_id:integer, question_option_id:integer, question_option_value:text, question_option_marks:integer, created_date:timestamp without time zone, modified_date:timestamp without time zone, status:integer |
| `public.assessment_schedule_students` | 13460 | id:integer, assessment_schedule_id:integer, student_id:text, coupon:text, assessment_given:boolean, created_date:timestamp without time zone, status:boolean, coupon_2:text, otp:integer, is_used:boolean, day_before_reminder_at:timestamp with time zone, hour_before_reminder_at:timestamp with time zone |
| `public.user_role` | 12817 | id:integer, user_id:uuid, role_id:integer, created_date:timestamp without time zone, modified_date:timestamp without time zone, status:integer, deleted_at:timestamp with time zone |
| `public.academic_report_details` | 11598 | id:integer, report_id:integer, subject:character varying, theory_marks:integer, practical_marks:integer, marks:integer, total_marks:integer, grade:character varying, created_date:timestamp with time zone, modified_date:timestamp with time zone, grade_point:numeric, original_marks:numeric, original_t |
| `public.user_school` | 10759 | id:integer, user_id:uuid, school_id:integer, created_date:timestamp without time zone, modified_date:timestamp without time zone, status:integer |
| `public.assessment_question_change` | 10702 | id:integer, assessment_id:integer, question_id:integer, language_id:integer, changed_text:text, expert_id:uuid, created_date:timestamp without time zone, modified_date:timestamp without time zone, status:integer, expertid:uuid, assignment_id:bigint, approve_status:character varying, approve_user:uui |
| `public.assessment_report_scoring_temp` | 8489 | id:bigint, assessment_response_id:bigint, assessment_id:bigint, subsection_id:integer, subsection_name:character varying, marks:numeric, total_marks:numeric, average:numeric, level:character varying, sub_levels:jsonb, created_at:timestamp with time zone, updated_at:timestamp with time zone, is_valid |
| `public.assessment_report_scoring_06022026` | 8341 | id:bigint, assessment_response_id:bigint, assessment_id:bigint, subsection_id:integer, subsection_name:character varying, marks:numeric, total_marks:numeric, average:numeric, level:character varying, sub_levels:jsonb, created_at:timestamp with time zone, updated_at:timestamp with time zone, is_valid |
| `public.user_fit_score_calculation` | 5326 | id:bigint, user_id:uuid, last_student_scores_updated_at:timestamp without time zone, last_fit_score_calculated_at:timestamp without time zone, student_scores_hash:character varying, is_current:boolean, created_at:timestamp without time zone, calculation_started_at:timestamp with time zone |
| `public.student_canonical_profile` | 4520 | id:bigint, student_id:uuid, is_current:boolean, engine_version:character varying, trigger_reason:character varying, point_count:integer, computed_at:timestamp with time zone, overlay_hash:character varying, has_overlay:boolean |
| `public.user_parent` | 3292 | id:integer, parent_id:uuid, student_id:uuid, status:integer, created_date:timestamp with time zone, modified_date:timestamp with time zone, deleted_at:timestamp with time zone, created_child:boolean |
| `public.report_translation_cache` | 3268 | id:bigint, source_hash:character, target_lang:character varying, source_text:text, translated_text:text, created_at:timestamp with time zone |
| `public.student_counselor` | 3249 | id:integer, student_id:uuid, counselor_id:uuid, status:integer, created_date:timestamp with time zone, modified_date:timestamp with time zone, deleted_at:timestamp with time zone |
| `public.report_static_content_change` | 3100 | id:integer, test_id:integer, language_id:integer, parent_id:integer, title:text, sequence:integer, description:text, image:character varying, note:text, type:character varying, view_type:character varying, status:integer, deleted_at:timestamp with time zone, created_at:timestamp with time zone, upda |
| `public.student_subject_selection` | 3077 | id:integer, user_id:uuid, subject_id:integer, subject_name:character varying, board_id:integer, status:smallint, created_at:timestamp with time zone, updated_at:timestamp with time zone, kind:character varying, grade_id:integer |
| `public.subcategory_countrywise_wages` | 3040 | subcategory_id:integer, country_id:integer, fresher:character varying, ten_yoe:character varying, beyond_ten_yoe:character varying, min_salary:character varying, max_salary:character varying |
| `public.assessment_question` | 2912 | id:integer, assessment_id:integer, section_id:integer, subsection_id:integer, question_id:integer, created_date:timestamp without time zone, modified_date:timestamp without time zone, status:integer, random:character varying, sequence:integer |

### Largest 25 tables

| Table | Est. rows |
|---|---|
| `public.career_cost` | 1180160 |
| `public.career_countrywise_wages` | 1180140 |
| `public.career_demand` | 1180140 |
| `public.assessment_response_question` | 1091538 |
| `public.user_subcategory_fitscore` | 779140 |
| `public.career_traitwise_score` | 758774 |
| `public.career_industry` | 373789 |
| `public.student_trait_score_point` | 323759 |
| `public.career_subjects` | 295035 |
| `public.map_career_subcluster` | 292528 |
| `public.student_canonical_trait` | 206599 |
| `public.assessment_response_question_backup_06022026` | 196062 |
| `public.user_access` | 183385 |
| `public.map_career_cluster` | 162660 |
| `public.assessment_report_scoring` | 148060 |
| `public.map_career_subcategory` | 120149 |
| `public.user_category_fitscore` | 112294 |
| `public.activity_change` | 109388 |
| `public.student_section` | 86471 |
| `public.career_option` | 59007 |
| `public.career_details` | 59007 |
| `public.assessment_option_change` | 42435 |
| `public.school_coupon_detail` | 33664 |
| `public.career` | 30498 |
| `public.user_logs` | 25513 |

## Vidysea (`vidyseaprodecs`)

346 tables, 539 foreign keys.

### Tables VC reads today (`config/sources.json`)

| Table | Est. rows | Columns |
|---|---|---|
| `users` | 2760 | id:uuid, email:character varying, password_hash:character varying, first_name:character varying, last_name:character varying, mobile:character varying, user_type:character varying, profile_picture_url:character varying, date_format_preference:character varying, is_active:boolean, is_verified:boolean, created_at:timestamp without time zone, updated_at:timestamp without time zone, email_verified_at:timestamp with time zone, mobile_verified_at:timestamp with time zone, provider:character varying, password_digest:character varying, registered_at:timestamp with time zone, disabled_at:timestamp with time zone, forgot_password:boolean, nationality:character varying, date_of_birth:date, source:character varying, academic_history:jsonb, login_attempts:integer, otp_attempts:integer, incorrect_login_at:timestamp without time zone, incorrect_otp_at:timestamp without time zone, locked_at:timestamp without time zone, forgot_otp_attempts:integer, incorrect_forgot_otp_at:timestamp without time zone, forgot_otp_locked_at:timestamp without time zone, pending_mobile:character varying, approved_by:uuid, approved_at:timestamp without time zone, approval_note:text, partner_form_filled:boolean, partner_document_uploaded:boolean, is_admin:boolean, two_factor_enabled:boolean, two_factor_secret:character varying, two_factor_secret_expires_at:timestamp without time zone, auth_provider:character varying, last_login_at:timestamp without time zone, is_external:boolean, referral_code:character varying, signup_ip:character varying, signup_country_code:character varying, signup_country_name:character varying, signup_region:character varying, signup_city:character varying, signup_geo:jsonb, signup_gps_lat:double precision, signup_gps_lng:double precision, signup_gps_accuracy:double precision, signup_gps_geo:jsonb, counsellor_money_visible:boolean, money_visible_updated_by:uuid, money_visible_updated_at:timestamp without time zone, is_demo:boolean, owner_can_reset:boolean |
| `students` | 2587 | id:uuid, date_of_birth:date, gender:character varying, nationality:character varying, passport_number:character varying, academic_level:character varying, field_of_interest:text, target_intake:character varying, budget_min:numeric, budget_max:numeric, budget_currency:character varying, preferred_countries:json, test_scores:json, current_journey_stage:character varying, journey_stage_updated_at:timestamp without time zone, assigned_counsellor_id:uuid, status:character varying, risk_level:character varying, last_activity_at:timestamp without time zone, created_at:timestamp without time zone, updated_at:timestamp without time zone, is_premium:boolean, preferred_courses:json, budget_range_text:character varying, student_code:character varying, referred_by_partner_id:uuid, neet_rank:integer, deleted_at:timestamp without time zone, deleted_by:uuid, academic_history_json:jsonb, profile_optimization_json:jsonb, profile_optimization_generated_at:timestamp without time zone, timezone:character varying, target_intake_date:date, dashboard_cache:jsonb, dashboard_cache_at:timestamp without time zone, data_sharing_consent:boolean, data_sharing_consent_at:timestamp without time zone, data_sharing_consent_text:text, extracurriculars:text, intake_form_json:json, work_experience_summary:character varying, additional_notes:text, information_form_json:jsonb, information_form_submitted_at:timestamp without time zone, reservation_category:character varying, lifecycle_state:character varying, lifecycle_updated_at:timestamp without time zone, journey_profile:character varying, stage_substeps:jsonb |
| `student_shortlisted_courses` | 588 | id:uuid, student_id:uuid, programme_id:character varying, university_id:character varying, programme_name:character varying, university_name:character varying, is_verified:boolean, verification_status:character varying, verified_by_id:uuid, counsellor_remarks:text, created_at:timestamp without time zone, updated_at:timestamp without time zone, application_cancelled_at:timestamp without time zone, application_started:boolean, application_started_at:timestamp without time zone, student_note:text, added_by:character varying, programme_priority:integer, accuracy_percent:integer, satisfaction_score:integer, application_pathway:character varying, reseller_partner_user_id:uuid, selected_aggregator_row_id:uuid, deleted_at:timestamp without time zone, deleted_by:uuid, student_decision:character varying, student_decision_at:timestamp without time zone, is_ai_recommended:boolean, fit_score:integer, fit_category:character varying, fit_reason:text, is_finalized:boolean, counsellor_fit_verdict:character varying, counsellor_fit_note:text, counsellor_fit_by_id:uuid, counsellor_fit_at:timestamp without time zone |
| `ai_profile_assessments` | -1 | id:uuid, student_id:uuid, academic_strength:character varying, english_proficiency:character varying, work_experience:character varying, financial_capability:character varying, previous_visa_history:character varying, preferred_intake:character varying, assessment_data_json:jsonb, created_at:timestamp without time zone, updated_at:timestamp without time zone |

### Test user record trace

Rows owned by the test user, one FK hop from `users.id`, plus a second hop below those:

| Table.column | Rows |
|---|---|
| `public.auth_controls.user_id` | 1 |
| `public.notifications.recipient_id` | 2 |
| `public.refresh_tokens.user_id` | 2 |
| `public.students.id` | 1 |
| `public.notification_sends.user_id` | 2 |
| `public.student_wallet.student_id` | 1 |
| `public.wallet_ledger.student_id` | 2 |
| `public.student_activity_log.actor_id` | 2 |
| `public.student_activity_log.student_id` (via `public.students`) | 1 |

### Other counselling-relevant tables (name match, top 40 by size)

| Table | Est. rows | Columns |
|---|---|---|
| `public.student_activity_log` | 3892 | id:uuid, student_id:uuid, actor_id:uuid, actor_name:character varying, actor_role:character varying, action:character varying, field_label:character varying, old_value:text, new_value:text, created_at:timestamp without time zone, source_surface:character varying, entity_type:character varying, entit |
| `public.programme_test_requirements` | 1874 | id:integer, programme_id:character varying, source_country:character varying, destination_country:character varying, university_name:character varying, program_name:character varying, rule_applied:character varying, test_array_common:jsonb, test_array_international:jsonb, created_at:timestamp with t |
| `public.user_roles` | 1651 | user_id:uuid, role:character varying, granted_at:timestamp without time zone, granted_by_user_id:uuid, status:character varying |
| `public.funnel_assessment_progress` | 1531 | journey_id:uuid, visitor_id:character varying, assessment_version:character varying, lp:character varying, brand:character varying, utm:jsonb, answers:jsonb, total:integer, answered:integer, completed_at:timestamp with time zone, attempt_id:uuid, created_at:timestamp with time zone, updated_at:times |
| `public.career_interest_attempts` | 1491 | id:uuid, assessment_id:integer, assessment_version:character varying, answers:jsonb, scores:jsonb, claim_token_hash:character varying, claim_expires_at:timestamp with time zone, claimed_at:timestamp with time zone, pathlynks_user_id:character varying, landing_slug:character varying, utm:jsonb, ip_ha |
| `public.user_course_journey_map` | 929 | id:bigint, user_id:uuid, course_id:character varying, university_id:character varying, created_at:timestamp without time zone, updated_at:timestamp without time zone, source:character varying, offer_status:character varying, university_name:character varying, program_name:character varying, country_ |
| `public.counsellor_provision_audit` | 726 | id:bigint, at:timestamp with time zone, email:text, pathlynks_user_id:text, identity_id:uuid, outcome:text, reason:text, origin:text, client_ip:text, detail:text |
| `public.student_wallet` | 574 | student_id:uuid, balance:integer, pending:integer, lifetime_earned:integer, lifetime_spent:integer, current_streak_days:integer, longest_streak_days:integer, last_streak_date:date, level:character varying, created_at:timestamp with time zone, updated_at:timestamp with time zone |
| `public.temp_users` | 525 | id:bigint, name:character varying, email:character varying, mobile:character varying, preferences:jsonb, created_at:timestamp without time zone |
| `public.user_preferences` | 341 | id:uuid, user_id:uuid, notification_settings:json, privacy_settings:json, theme:character varying, language:character varying, timezone:character varying, created_at:timestamp without time zone, updated_at:timestamp without time zone, dashboard_layout:json |
| `public.pathlynks_student_link` | 329 | pathlynks_student_id:text, vidysea_user_id:uuid, email:text, mobile:text, consent_at:timestamp with time zone, created_at:timestamp with time zone, updated_at:timestamp with time zone |
| `public.counsellor_os_jit_attempts` | 305 | bucket:text, attempts:integer, first_attempt_at:timestamp with time zone, last_attempt_at:timestamp with time zone, blocked_until:timestamp with time zone |
| `public.applications` | 283 | id:uuid, student_id:uuid, university_name:character varying, university_id:character varying, program_name:character varying, program_id:character varying, program_level:character varying, application_status:character varying, application_deadline:date, submission_date:date, decision_date:date, offe |
| `public.student_test_scores` | 246 | id:uuid, student_id:uuid, test_name:character varying, total_score:numeric, date_taken:date, is_official:boolean, sectional_scores:json, created_at:timestamp without time zone, updated_at:timestamp without time zone, status:character varying, score_unit:character varying, planned_date:date, booked_d |
| `public.student_dashboard_ai_cache` | 238 | id:uuid, user_id:uuid, kind:character varying, input_hash:character varying, payload:jsonb, created_at:timestamp without time zone, updated_at:timestamp without time zone |
| `public.user_favourites` | 234 | id:uuid, user_id:uuid, university_id:character varying, created_at:timestamp without time zone, item_type:character varying, item_id:character varying, item_name:character varying, university_name:character varying, notes:text |
| `public.student_preference_snapshots` | 222 | id:uuid, student_id:uuid, dedupe_hash:character varying, preference_json:jsonb, is_current:boolean, created_at:timestamp with time zone, last_used_at:timestamp with time zone |
| `public.application_timeline` | 220 | id:uuid, application_id:uuid, event_type:character varying, event_description:text, old_value:character varying, new_value:character varying, performed_by_user_id:uuid, created_at:timestamp without time zone |
| `public.programme_journey_record` | 219 | id:bigint, programme_id:character varying, nationality:character varying, record_json:jsonb, source_urls:text, confidence:double precision, official_source:boolean, updated_at:timestamp without time zone |
| `public.counselling_leads` | 219 | id:uuid, user_id:uuid, name:character varying, email:character varying, mobile:character varying, message:character varying, source:character varying, status:character varying, created_at:timestamp without time zone |
| `public.country_guide_content` | 186 | id:uuid, field_id:uuid, destination_country:character varying, source_country:character varying, level:character varying, value:jsonb, source_kind:character varying, is_published:boolean, generated_at:timestamp without time zone, updated_by:uuid, created_at:timestamp without time zone, updated_at:ti |
| `public.student_academic_history` | 121 | id:uuid, student_id:uuid, degree_type:character varying, institution_name:character varying, field_of_study:character varying, start_date:date, end_date:date, gpa:numeric, percentage:numeric, country:character varying, is_current:boolean, created_at:timestamp without time zone, updated_at:timestamp  |
| `public.recommendation_rating_prompt_state` | 121 | user_id:uuid, last_skipped_at:timestamp without time zone, updated_at:timestamp without time zone |
| `public.counselor_assignments` | 81 | id:uuid, counselor_user_id:uuid, student_id:uuid, demand_partner_id:uuid, source:character varying, assigned_by_user_id:uuid, status:character varying, note:text, created_at:timestamp without time zone, updated_at:timestamp without time zone, service_code:character varying, delegated_by_user_id:uuid |
| `public.counsellor_identity` | 80 | identity_id:uuid, email:text, brand:text, type:text, vidysea_user_id:uuid, pathlynks_user_id:text, status:text, created_at:timestamp with time zone, updated_at:timestamp with time zone, pathlynks_token:text, pathlynks_token_at:timestamp with time zone, pathlynks_school_id:text, source:text, pathlynk |
| `public.pathlynks_student_snapshot` | 74 | id:uuid, vidysea_user_id:uuid, pathlynks_student_id:text, grade:integer, grade_label:text, board:text, subjects_json:jsonb, academics_json:jsonb, selected_career_name:text, selected_career_category_id:text, selected_career_at:timestamp with time zone, career_picks_json:jsonb, target_university_name: |
| `public.student_workflow_reviews` | 66 | id:uuid, student_id:uuid, kind:character varying, subject_id:character varying, state:character varying, version:integer, payload:jsonb, resolution:jsonb, created_by:uuid, created_at:timestamp with time zone |
| `public.counsellor_os_assessment_battery_item` | 51 | id:bigint, grade_id:integer, cycle_no:integer, cycle_minutes:integer, seq:integer, module_alias:character varying, module_label:character varying, assessment_id:integer, paper_name:character varying, expected_questions:integer, expected_minutes:integer, length_label:character varying, created_at:tim |
| `public.counsellor_os_tour_progress` | 49 | id:uuid, identity_id:uuid, tour_id:text, seen:boolean, seen_at:timestamp with time zone, created_at:timestamp with time zone, updated_at:timestamp with time zone |
| `public.school_fee_payments` | 39 | id:uuid, school_id:uuid, class_fee_id:uuid, student_name:character varying, class_name:character varying, section:character varying, contact_number:character varying, parent_name:character varying, amount:numeric, currency:character varying, status:character varying, merchant_reference:character var |
| `public.counsellor_service_setup` | 36 | user_id:uuid, version:integer, status:character varying, data:jsonb, outcome:jsonb, confirmed_at:timestamp without time zone, consent_version:character varying |
| `public.student_documents` | 36 | id:uuid, student_id:uuid, document_type:character varying, file_url:character varying, file_name:character varying, file_size:bigint, uploaded_by_user_id:uuid, verification_status:character varying, is_flagged:boolean, flag_reason:text, verified_by_counsellor_id:uuid, verified_at:timestamp without t |
| `public.counselor_university_recommendations` | 22 | id:uuid, student_id:uuid, recommendations:jsonb, rec_count:integer, use_documents:boolean, generated_by:uuid, generated_at:timestamp without time zone, updated_at:timestamp without time zone |
| `public.school_class_fees` | 19 | id:uuid, school_id:uuid, class_name:character varying, amount:numeric, active:boolean, created_at:timestamp without time zone, updated_at:timestamp without time zone, pathlynks_package_id:integer, pathlynks_grade_id:integer |
| `public.student_tool_results` | 18 | id:uuid, student_id:uuid, tool_code:character varying, input:jsonb, output:jsonb, status:character varying, error_message:text, duration_ms:integer, created_at:timestamp without time zone, topic_key:character varying, pinned_to_journey:boolean |
| `public.service_application_status_log` | 17 | id:uuid, application_id:uuid, from_status:character varying, to_status:character varying, changed_by_user_id:uuid, actor_role:character varying, note:text, created_at:timestamp without time zone |
| `public.school_class_tiers` | 15 | id:uuid, school_id:uuid, class_name:character varying, tier_key:character varying, tier_label:character varying, mrp:numeric, amount:numeric, discount_percent:numeric, whats_included:text, sort_order:integer, active:boolean, created_at:timestamp without time zone, updated_at:timestamp without time z |
| `public.research_report_jobs` | 14 | id:uuid, counsellor_id:uuid, student_id:uuid, status:character varying, stage:character varying, progress:integer, result_json:jsonb, report_url:text, error:text, created_at:timestamp without time zone, started_at:timestamp without time zone, finished_at:timestamp without time zone, mode:character v |
| `public.counselor_platform_subscriptions` | 11 | id:uuid, counselor_user_id:uuid, plan_code:character varying, status:character varying, amount:numeric, currency:character varying, current_period_start:timestamp without time zone, current_period_end:timestamp without time zone, payment_ref:character varying, razorpay_payment_id:character varying,  |
| `public.student_service_requirement` | 5 | id:uuid, student_id:uuid, service_code:character varying, status:character varying, notes:text, created_by_user_id:uuid, created_at:timestamp without time zone, updated_at:timestamp without time zone |

### Largest 25 tables

| Table | Est. rows |
|---|---|
| `public.cities` | 153728 |
| `public.milestone_notification_log` | 72394 |
| `public.funnel_events` | 27240 |
| `public.milestones` | 14805 |
| `public.funnel_ip_locations` | 9481 |
| `public.otp_tokens` | 5479 |
| `public.whatsapp_message_events` | 5385 |
| `public.states` | 5296 |
| `public.journey_phases` | 3961 |
| `public.student_activity_log` | 3892 |
| `public.users` | 2760 |
| `public.students` | 2587 |
| `public.notifications` | 2507 |
| `public.refresh_tokens` | 2114 |
| `public.programme_test_requirements` | 1874 |
| `public.user_roles` | 1651 |
| `public.funnel_assessment_progress` | 1531 |
| `public.notification_sends` | 1529 |
| `public.career_interest_attempts` | 1491 |
| `public.auth_controls` | 1117 |
| `public.user_course_journey_map` | 929 |
| `public.whatsapp_messages` | 831 |
| `public.open_search_history` | 805 |
| `public.counsellor_provision_audit` | 726 |
| `public.whatsapp_webhook_events` | 677 |

## Findings (2026-10-28)

- Both handover DB users are **privileged** (they can write). The Pathlynks port runs them only with
  `PATHLYNKS_ALLOW_PRIVILEGED_ROLE=1` (G1). The Vidysea port refuses them by design (`mcp/pathlynks/src/port.ts:291`),
  so Vidysea needs a real read-only role, or a decision.
- The Vidysea DB user is lowercase `vidysedevaadmin` (the handover says `Vidysedevaadmin`; Postgres rejects that).
- VC's live Pathlynks port, run against the test user, returned: profile 1 row (name, grade); saved careers 0; compare 0;
  assessment status 1 row.
- TLS: Node's default trust store does not include the RDS CA. `PgConnectionConfig.caFileRef` exists in `mcp/pathlynks/src/connect.ts`, but the strict `config/sources.json` schema (`packages/schemas/src/sources.ts`) rejects it, so the seeded sources cannot carry it yet. That is a code gap for the build unit; CA bundle: `D:/vc/certs/rds-global-bundle.pem`.

## Test student: full data map (correction, 2026-10-28)

The earlier "saved careers 0, compare 0" result was about **the tables VC reads**, not about the student. The student
has real Pathlynks data; VC's port just doesn't read most of it. One person, via SSO: the same email appears in both
platforms' `users`.

**SSO link (Vidysea side).** `pathlynks_student_link` (~329 rows: `pathlynks_student_id` ↔ `vidysea_user_id`, email,
`consent_at`) and `pathlynks_student_snapshot` (~74 rows: grade, board, subjects, academics, selected career,
career picks, target university, university preferences). The test student has 1 row in each.

**Pathlynks rows for the test student** (counts; any user/student id column, not only declared FKs):

| Table | Rows | What it holds (columns) | Read by VC today? |
|---|---|---|---|
| `user_subcategory_fitscore` | 152 | fit_score, confidence, `top_careers_detail`, `derived_traits` per subcategory | no |
| `user_category_fitscore` | 22 | fit_score, confidence, note per career category | no |
| `student_trait_score_point` | 61 | trait_key/name, raw/normalised score, level per module | no |
| `combined_report_llm_data` | 2 | `response_json`: the generated Combined Report | no |
| `category_judge_model` | 1 | `assessment_scores`, `response_json`, review/approval | no |
| `academic_report` (+ details 6) | 1 | exam year, result, grade | no |
| `assessment_response` (+ 177 answers, 28 scoring rows) | 4 | assessment attempts | status only |
| `language_pref` | 2 | language priority | no |
| `user_grade`, `user_school`, `student_section` | 1 / 1 / 6 | grade, school, section | grade only |
| `student_saved_careers`, `student_career_compare` | 0 | explicit saves / compares | yes (empty) |

**Vidysea rows for the test student:** `students` 1 (no shortlist, no `ai_profile_assessments`), wallet, notifications,
activity log, plus the SSO link and snapshot above.

**Implication for the build.** A grounded Pathlynks answer needs the fit scores (category + subcategory, with top
careers), the trait scores, and the Combined Report. On the Vidysea side, the student's context is the
`pathlynks_student_snapshot`, not the Vidysea shortlist. None of these are in the port's read model yet
(`mcp/pathlynks/src/port.ts`, `config/sources.json` `tables`).
