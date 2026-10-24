-- 0002: plot sizes in square feet, standard property types for a new company, and "a block belongs to its project".

-- Land is stored as the user typed it (value + unit) AND as normalized square feet. The marla size is a company
-- setting (companies.settings -> marla_sqft; Punjab standard 272.25 sq ft); the other units are fixed.
create or replace function app.normalize_area(p_company uuid, p_value numeric, p_unit text) returns numeric
language plpgsql stable as $$
declare v_marla numeric; v_factor numeric;
begin
  if p_value is null or p_value <= 0 then raise exception 'A size must be greater than zero' using errcode = '23514'; end if;
  select coalesce(nullif(settings ->> 'marla_sqft', '')::numeric, 272.25) into v_marla from companies where id = p_company;
  v_marla := coalesce(v_marla, 272.25);
  v_factor := case p_unit when 'sqft' then 1 when 'marla' then v_marla when 'kanal' then 20 * v_marla
                          when 'sqyd' then 9 when 'acre' then 43560 end;
  if v_factor is null then raise exception 'Unknown size unit "%"', p_unit using errcode = '23514'; end if;
  return round(p_value * v_factor, 2);
end $$;

-- What every new company starts with. Idempotent: running it again adds only what is missing.
-- Called by the setup script today and by the sign-up flow later.
create or replace function app.seed_company_defaults(p_company uuid) returns int
language plpgsql as $$
declare v_added int;
begin
  update companies set settings = settings || '{"marla_sqft": 272.25}'::jsonb
   where id = p_company and not (settings ? 'marla_sqft');

  insert into property_types (company_id, code, name, property_group)
  select p_company, t.code, t.name, t.grp
    from (values
      ('plot',            'Residential Plot', 'residential'),
      ('commercial_plot', 'Commercial Plot',  'commercial'),
      ('house',           'House',            'residential'),
      ('apartment',       'Apartment',        'residential'),
      ('shop',            'Shop',             'commercial'),
      ('office',          'Office',           'commercial'),
      ('farmhouse',       'Farmhouse',        'agricultural'),
      ('warehouse',       'Warehouse',        'industrial')) as t(code, name, grp)
  on conflict (company_id, code) do nothing;
  get diagnostics v_added = row_count;
  return v_added;
end $$;

-- A property's block must be a block of the property's own project.
create or replace function app.assert_block_in_project() returns trigger
language plpgsql as $$
declare v_project uuid;
begin
  if new.block_id is null then return new; end if;
  select project_id into v_project from project_blocks where id = new.block_id;
  if new.project_id is distinct from v_project then
    raise exception 'The block does not belong to the property''s project' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger properties_block_in_project before insert or update of block_id, project_id on properties
  for each row execute function app.assert_block_in_project();
