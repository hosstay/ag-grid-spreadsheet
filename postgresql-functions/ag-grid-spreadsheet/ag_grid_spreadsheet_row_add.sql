CREATE OR REPLACE FUNCTION ag_grid_spreadsheet_row_add (grid_name text, column_names text[], column_data_types text[], column_values text[]) RETURNS INTEGER AS $$
DECLARE
	retval INTEGER;
	
	columns_length INTEGER = array_length(column_names, 1);
	columns_index INTEGER = 1;
	
	next_grid_specific_id INTEGER = -1;
	
	number_of_tables INTEGER = -1;
	number_of_tables_index INTEGER = 1;
	data_table_name text = '';
	style_table_name text = '';
	columns_table_name text = '';
	
	action_query text = '';
	action_query_part_2 text = '';
BEGIN
	--get next grid_specific_id
	EXECUTE 'SELECT ag_grid_spreadsheet_get_next_grid_specific_id(''' || grid_name || ''');'
	INTO next_grid_specific_id;
	
	IF next_grid_specific_id = -1 THEN
		--RAISE NOTICE 'Couldn''t find next grid_specific_id';
		RETURN -1;
	END IF;
	
	--get number_of_tables
	EXECUTE 'SELECT ag_grid_spreadsheet_get_number_of_tables(''' || grid_name || ''');'
	INTO number_of_tables;
	
	IF number_of_tables < 1 THEN
		--RAISE NOTICE 'No tables';
		RETURN -1;
	END IF;

	--do for every table
	WHILE number_of_tables_index <= number_of_tables LOOP
		--get table name
		IF number_of_tables_index = 1 THEN
			data_table_name = grid_name;
			style_table_name = grid_name || '_style';
		ELSE
			data_table_name = grid_name || '_' || number_of_tables_index;
			style_table_name = grid_name || '_style_' || number_of_tables_index;
		END IF;

		action_query = 'WITH t as (INSERT INTO ' || data_table_name || ' (grid_specific_id,';
		action_query_part_2 = ') VALUES (' || next_grid_specific_id || ',';
		
		WHILE columns_index <= columns_length LOOP
			EXECUTE 'SELECT table_name FROM ' || grid_name || '_columns WHERE column_name = ''' || column_names[columns_index] || ''''
			INTO columns_table_name;
			
			IF columns_table_name = data_table_name THEN
				action_query = action_query || column_names[columns_index] || ',';

				--for nulls we have do something special
				IF column_values[columns_index] IS NOT NULL THEN
					--changing insert format depending on datatype
					IF column_data_types[columns_index] = 'integer' THEN 
						action_query_part_2 = action_query_part_2 || column_values[columns_index] || ',';
					ELSE
						action_query_part_2 = action_query_part_2 || '''' || column_values[columns_index] || ''',';
					END IF;
				ELSE
					action_query_part_2 = action_query_part_2 || 'null,';
				END IF;
			END IF;
			
			columns_index = columns_index + 1;
		END LOOP;
		columns_index = 1;
		
		action_query = RTRIM(action_query, ',') || RTRIM(action_query_part_2, ',') || ') RETURNING grid_specific_id, id)';
		action_query = action_query || 'INSERT INTO ' || style_table_name || ' (grid_specific_id, id) SELECT t.grid_specific_id, t.id FROM t RETURNING id;';

		EXECUTE action_query INTO retval;

		number_of_tables_index = number_of_tables_index + 1;
	END LOOP;
	number_of_tables_index = 1;
	
	RETURN retval;
END; $$
LANGUAGE plpgsql;


--examples:
SELECT ag_grid_spreadsheet_row_add('table_name', 
																		'{last_name, first_name, dob, relationship, address1, city, state, zip, gender, tobacco}',
																		'{}',
																		'{Nice Last Name, Nice First Name, 2000-01-01, Employee, 1234 Lincoln Ave, Kansas City, KS, null, Male, No}');
												
SELECT ag_grid_spreadsheet_row_add('table_name', 
																		'{name, total, form}',
																		'{text, integer}',
																		'{Test 101, 845, null}');