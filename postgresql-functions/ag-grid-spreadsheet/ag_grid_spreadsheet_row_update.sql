CREATE OR REPLACE FUNCTION ag_grid_spreadsheet_row_update(grid_name text, unique_keys text[], column_names text[], column_data_types text[], column_values text[]) RETURNS INTEGER AS $$
DECLARE
	retval  INTEGER;
	
	unique_keys_length INTEGER = array_length(unique_keys, 1);
	unique_keys_index INTEGER = 1;
	unique_keys_values text[] = ARRAY[]::text[];
	unique_check_query text = '';
	
	columns_length INTEGER = array_length(column_names, 1);
	columns_index INTEGER = 1;
	
	number_of_tables INTEGER = -1;
	number_of_tables_index INTEGER = 1;
	data_table_name text = '';
	columns_table_name text = '';
	
	update_id INTEGER = -1;
	
	action_query text = '';
BEGIN
	--get number_of_tables
	EXECUTE 'SELECT ag_grid_spreadsheet_get_number_of_tables(''' || grid_name || ''');'
	INTO number_of_tables;
	
	IF number_of_tables < 1 THEN
		--RAISE NOTICE 'No tables';
		RETURN -1;
	END IF;

	--search for a record that matches unique_keys_values
	unique_check_query = 'SELECT id FROM ';
	
	WHILE number_of_tables_index <= number_of_tables LOOP
		--get table name
		IF number_of_tables_index = 1 THEN
			data_table_name = grid_name;
		ELSE
			data_table_name = grid_name || '_' || number_of_tables_index;
		END IF;
		
		IF number_of_tables_index != 1 THEN
			unique_check_query = unique_check_query || ' INNER JOIN ';
		END IF;
		
		unique_check_query = unique_check_query || data_table_name;
		
		IF number_of_tables_index != 1 THEN
			unique_check_query = unique_check_query || ' USING (grid_specific_id, id) ';
		END IF;

		number_of_tables_index = number_of_tables_index + 1;
	END LOOP;
	number_of_tables_index = 1;
	
	--where clause generated from unique_keys
	unique_check_query = unique_check_query || ' WHERE ';

	WHILE unique_keys_index <= unique_keys_length LOOP
		WHILE columns_index <= columns_length LOOP
			IF column_names[columns_index] = unique_keys[unique_keys_index] THEN

				--for nulls we have do something special
				IF column_values[columns_index] IS NOT NULL THEN
					--changing where format depending on datatype
					IF column_data_types[columns_index] = 'integer' THEN 
						unique_check_query = unique_check_query || unique_keys[unique_keys_index] || ' = ' || column_values[columns_index];
					ELSE
						unique_check_query = unique_check_query || unique_keys[unique_keys_index] || ' = ''' || column_values[columns_index] || '''';
					END IF;
				ELSE
					unique_check_query = unique_check_query || unique_keys[unique_keys_index] || ' IS null';
				END IF;
			END IF;
			
			columns_index = columns_index + 1;
		END LOOP;
		columns_index = 1;
		
		IF unique_keys_index != unique_keys_length THEN
			unique_check_query = unique_check_query || ' AND ';
		END IF;

		unique_keys_index = unique_keys_index + 1;
	END LOOP;
	unique_keys_index = 1;
	columns_index = 1;
	
	unique_check_query = unique_check_query || ';';
	
	EXECUTE unique_check_query INTO update_id;
	
	--if it finds something
	IF update_id IS NOT NULL AND update_id > 0 THEN
	  --update
		
		WHILE number_of_tables_index <= number_of_tables LOOP
			--get table name
			IF number_of_tables_index = 1 THEN
				data_table_name = grid_name;
			ELSE
				data_table_name = grid_name || '_' || number_of_tables_index;
			END IF;
			
			--start update string
			action_query = 'UPDATE ' || data_table_name || ' SET ';
			
			WHILE columns_index <= columns_length LOOP
				--only update targets that are in the current table.
				EXECUTE 'SELECT table_name FROM ' || grid_name || '_columns WHERE column_name = ''' || column_names[columns_index] || ''''
				INTO columns_table_name;
				
				IF columns_table_name = data_table_name THEN
					--for nulls we have do something special
					IF column_values[columns_index] IS NOT NULL THEN
						--changing input format depending on datatype
						IF column_data_types[columns_index] = 'integer' THEN 
							action_query = action_query || column_names[columns_index] || ' = ' || column_values[columns_index] || ',';
						ELSE
							action_query = action_query || column_names[columns_index] || ' = ''' || column_values[columns_index] || ''',';
						END IF;
					ELSE
						action_query = action_query || column_names[columns_index] || ' = null,';
					END IF;
				END IF;
				
				columns_index = columns_index + 1;
			END LOOP;
			columns_index = 1;
					
			action_query = RTRIM(action_query, ',') || ' WHERE id = ' || update_id || 'RETURNING id';
			
			EXECUTE action_query INTO retval;

			number_of_tables_index = number_of_tables_index + 1;
		END LOOP;
		number_of_tables_index = 1;

		retval = update_id;
	ELSE
		--RAISE NOTICE 'No match to update';
		retval = -1;
	END IF; 
	
	RETURN retval;
END; $$
LANGUAGE plpgsql;


--examples:
SELECT ag_grid_spreadsheet_row_update('table_name',
																			'{last_name, first_name}',
																			'{last_name, first_name, dob, relationship, address1, city, state, zip, gender, tobacco}',
																			'{}',
																			'{Nice Last, Nice First, 2001-01-01, Employee, 1234 Lincoln Ave, Kansas City, KS, null, Male, No}');

SELECT ag_grid_spreadsheet_row_update('table_name', 
																			'{name}', 
																			'{name, total, a_name, notes1, plan}',
																			'{text, integer}',
																			'{Test 101, 845, Jonas, null, null}'); 