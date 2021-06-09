CREATE OR REPLACE FUNCTION ag_grid_spreadsheet_get_next_grid_specific_id (grid_name text) RETURNS INTEGER AS $$
DECLARE
	retval INTEGER = -1;
BEGIN
	EXECUTE 'SELECT grid_specific_id + 1 FROM ' || grid_name || ' ORDER BY grid_specific_id DESC LIMIT 1;' 
	INTO retval;
	
	IF retval IS NULL THEN
		retval = 1;
	END IF;
	
	RETURN retval;
END; $$
LANGUAGE plpgsql;


--examples:
SELECT ag_grid_spreadsheet_get_next_grid_specific_id('table_name');