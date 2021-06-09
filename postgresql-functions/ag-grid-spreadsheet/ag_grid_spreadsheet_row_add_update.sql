CREATE OR REPLACE FUNCTION ag_grid_spreadsheet_row_add_update(grid_name text, unique_keys text[], column_names text[], column_data_types text[], column_values text[]) RETURNS INTEGER AS $$
DECLARE
	retval  INTEGER;
BEGIN
	EXECUTE format('SELECT ag_grid_spreadsheet_row_update(''%s'', ''%s'', ''%s'', ''%s'', ''%s'');', grid_name, unique_keys, column_names, column_data_types, column_values)
	INTO retval;

	IF retval IS NULL OR retval < 1 THEN
		EXECUTE format('SELECT ag_grid_spreadsheet_row_add(''%s'', ''%s'', ''%s'', ''%s'');', grid_name, column_names, column_data_types, column_values)
		INTO retval;

		IF retval IS NULL OR retval < 1 THEN
			--RAISE NOTICE 'Add Row Failed';
			retval = -1;		
		END IF;
	END IF; 
	
	RETURN retval;
END; $$
LANGUAGE plpgsql;


--examples:
SELECT ag_grid_spreadsheet_row_add_update('table_name', 
                                          '{last_name, first_name, dob}', 
                                          '{last_name, first_name, dob, relationship, address1, city, state, zip, gender, tobacco}',
                                          '{}',
                                          '{Lock, Door, 2000-01-01, Spouse, 1234 Lincoln Ave, Kansas City, null, 69029, Male, No}');
														
SELECT ag_grid_spreadsheet_row_add_update('table_name', 
                                          '{person_id, person_activity_id, last_name, first_name, dob}', 
                                          '{person_id, person_activity_id, last_name, first_name, dob, relationship, address1, city, state, zip, gender, tobacco}',
                                          '{integer, integer}',
                                          '{9998, 9997, Not, Second, 2000-01-01, Employee, 1234 Lincoln Ave, Kansas City, KS, null, Male, No}');

SELECT ag_grid_spreadsheet_row_add_update('table_name', 
                                          '{name, total}', 
                                          '{name, total, form}',
                                          '{text, integer}',
                                          '{Test 900, 456, null}');