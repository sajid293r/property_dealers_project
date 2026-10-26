-- 0016: each person's interface language. Null means "not chosen": the company's default language
-- (companies.settings -> 'default_language', validated by the API) applies, then English.

alter table users add column preferred_language text
  check (preferred_language in ('en','ur','ps','zh','fr','de','ja','ar'));
