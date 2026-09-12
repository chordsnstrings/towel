ALTER TABLE members ADD COLUMN phone_key TEXT GENERATED ALWAYS AS (
  CASE
    WHEN regexp_replace(translate(phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g') LIKE '00%'
      THEN substring(regexp_replace(translate(phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g') FROM 3)
    WHEN regexp_replace(translate(phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g') ~ '^0[2-9][0-9]{7,8}$'
      THEN '971' || substring(regexp_replace(translate(phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g') FROM 2)
    WHEN regexp_replace(translate(phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g') ~ '^5[0-9]{8}$' AND phone NOT LIKE '+%'
      THEN '971' || regexp_replace(translate(phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g')
    ELSE regexp_replace(translate(phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g')
  END
) STORED;
CREATE INDEX members_phone_key_idx ON members(phone_key text_pattern_ops);
CREATE INDEX members_phone_suffix_idx ON members(right(phone_key, 4));
ALTER TABLE towel_transactions ADD COLUMN sequence BIGSERIAL UNIQUE;
ALTER TABLE towel_transactions ADD COLUMN reversal_of UUID UNIQUE REFERENCES towel_transactions(id);
CREATE INDEX transactions_member_sequence_idx ON towel_transactions(member_id, sequence DESC);
