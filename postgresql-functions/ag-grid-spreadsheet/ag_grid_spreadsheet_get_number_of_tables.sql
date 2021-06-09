CREATE OR REPLACE FUNCTION ag_grid_spreadsheet_get_number_of_tables (grid_name text) RETURNS INTEGER AS $$
DECLARE
	retval INTEGER = -1;
	
	query text = '';
	keep_going INTEGER = 1;
	num INTEGER = 0; 
BEGIN
	--select for next table until there isn't one.
	WHILE keep_going = 1 LOOP
		query = 'SELECT to_regclass(''' || grid_name;
		IF num = 0 THEN
			query = query || ''')';
		ELSE
			query = query || '_' || num + 1 || ''')';
		END IF;
			
		EXECUTE query INTO retval;
		
		IF retval IS NULL THEN
			keep_going = 0;
		ELSE
			num = num + 1;
		END IF;
	END LOOP;
	
	IF num < 1 THEN
		retval = -1;
	ELSE
		retval = num;
	END IF;
	
	RETURN retval;
END; $$
LANGUAGE plpgsql;


--examples:
SELECT ag_grid_spreadsheet_get_number_of_tables('table_name');