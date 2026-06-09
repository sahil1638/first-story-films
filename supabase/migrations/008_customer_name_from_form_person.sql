UPDATE customers c
SET couple_name = COALESCE(NULLIF(o.your_name, ''), o.couple_name)
FROM orders o
WHERE c.order_id = o.id;
