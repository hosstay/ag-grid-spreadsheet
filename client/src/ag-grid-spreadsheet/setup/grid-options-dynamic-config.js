import {Grid} from 'ag-grid-community';

import {verifyDataTable,
  verifyColumnTable,
  verifyStyleTable,
  getDBColumnTable,
  getDataTablesSchema,
  currencyComparator,
  numericComparator,
  errorHandler,
  toTitleCase,
  debugLog} from '../utility/utility';
import {processCellForDatabase,
  modifyRowData} from '../actions/grid-functions';

export async function gridOptionsDynamicConfig(context, initialSetup = false) {
  try {
    const gridOptions = context.gridOptions;

    if (initialSetup) {
      await verifyDataTable(context);
      await verifyColumnTable(context);

      const COLUMN_TABLE_DATA = await getDBColumnTable(context);
      await context.setColumnTable(COLUMN_TABLE_DATA);

      gridOptions.columnDefs = await generateColumnDefs(context, COLUMN_TABLE_DATA);

      const gridDiv = document.querySelector(`#${context.gridDiv}`);

      console.log('make grid');

      // console.log(gridDiv);
      // console.log(Object.assign({}, gridOptions));

      context.grid = new Grid(gridDiv, gridOptions);

      console.log('grid made');

      debugLog('grid created');

      await verifyStyleTable(context);
    } else {
      const COLUMN_TABLE_DATA = await getDBColumnTable(context);
      await context.setColumnTable(COLUMN_TABLE_DATA);

      gridOptions.columnDefs = await generateColumnDefs(context, COLUMN_TABLE_DATA);
      debugLog('gridOptions set');
    }

    console.log('10');

    return true;
  } catch (err) {
    return errorHandler({err: err, context: 'gridOptionsDynamicConfig'});
  }
}

export async function generateColumnDefs(context, columns) {
  const generateColumnDefEntry = (column) => {
    const entry = {};

    if (context.params.options.reporting) {
      entry.filter = 'text';
    }

    let headerName;
    if (!column.custom_header_name && column.custom_header_name !== '') {
      headerName = column.column_name;
      headerName = headerName.replace(/_/g, ' ');
      headerName = toTitleCase(headerName);
    } else {
      headerName = column.custom_header_name;
    }

    entry.headerName = String(headerName);
    entry.field = String(column.column_name);

    if (/adminaggridspreadsheet/.test(document.URL)) {
      entry.editable = true;
      return entry;
    }

    entry.hide = column.hide;

    if (column.width) {
      entry.width = column.width;
    }

    if (context.params.options.reporting) {
      entry.editable = false;
    } else {
      entry.editable = function(params) {
        let editable;

        if (entry.field === 'locked') {
          editable = true;
        } else if (params.data.locked === 'true') {
          editable = false;
        } else {
          if (column.editable === false) {
            editable = false;
          } else {
            editable = true;
          }
        }

        return editable;
      };
    }

    if (column.pinned) {
      entry.pinned = column.pinned;
    }

    if (column.cell_editor) {
      if (column.cell_editor === 'checkbox') {
        entry.cellRenderer = function(params) {
          const input = document.createElement('input');
          input.type = 'checkbox';
          const checked = params.value === 'true' ? true : false;
          input.checked = checked;
          input.addEventListener('click', async (event) => {
            try {
              const oldValue = params.value;
              let newValue;

              if (oldValue !== null && oldValue !== '') {
                newValue = oldValue === 'true' ? 'false' : 'true';
              } else {
                newValue = 'true';
              }

              params.node.data[entry.field] = newValue;

              modifyRowData(context, params.rowIndex, params.colDef.field, newValue);

              await processCellForDatabase(context, params.rowIndex, params.colDef.field, oldValue, newValue);
            } catch (err) {
              return errorHandler({err: err, context: 'entry.cellRenderer', isLast: true});
            }
          });

          return input;
        };
      } else if (column.cell_editor === 'select') {
        const createOptionElement = (name) => {
          const option = document.createElement('option');
          option.value = name;
          option.innerHTML = name;

          return option;
        };

        if (type1) {
          entry.cellRenderer = (params) => {
            if (!params.data.additional_description) return;

            const input = document.createElement('select');
            input.style.width = '100%';

            const optionsRoutes = {
              'opt1': ['opt2', 'opt3'],
              'opt2': ['opt1', 'opt3'],
              'opt3': ['opt1', 'opt2']
            };

            input.appendChild(createOptionElement(params.data.additional_description.trim()));

            for (let i = 0, keys = Object.keys(optionsRoutes); i < keys.length; i++) {
              const key = keys[i];

              if (key === params.data.additional_description.trim()) {
                for (let j = 0; j < optionsRoutes[key].length; j++) {
                  const route = optionsRoutes[key][j];

                  input.appendChild(createOptionElement(route));
                }

                break;
              }
            }

            input.addEventListener('change', async (event) => {
              try {
                const newValue = event.target.value;
                const oldValue = params.node.data[entry.field];
                params.node.data[entry.field] = newValue;

                modifyRowData(context, params.rowIndex, params.colDef.field, newValue);

                await processCellForDatabase(context, params.rowIndex, params.colDef.field, oldValue, newValue);
              } catch (err) {
                return errorHandler({err: err, context: 'entry.cellRenderer', isLast: true});
              }
            });

            return input;
          };
        } else if (type2) {
          entry.cellRenderer = (params) => {
            let input = document.createElement('select');
            input.style.width = '100%';
            const optionsRoutes = ['Active', 'Inactive'];

            let value = params.data ? params.data.status : params.value;
            value = !value ? 'Active' : value;

            if (!params.data) {
              input.appendChild(createOptionElement(value));
            } else if (params.data.relationship !== 'Employee') {
              input = document.createElement('div');
              input.style.width = '100%';
              input.innerHTML = params.value;
              input.value = params.value;
              return input;
            } else {
              input.appendChild(createOptionElement(value));
            }

            optionsRoutes.forEach((route) => {
              if (route !== value) {
                input.appendChild(createOptionElement(route));
              }
            });

            input.addEventListener('change', async (event) => {
              try {
                const newValue = event.target.value;
                const oldValue = params.node.data ? params.node.data[entry.field] : params.value;

                if (params.node.data) {
                  modifyRowData(context, params.rowIndex, params.colDef.field, newValue);
                  await processCellForDatabase(context, params.rowIndex, params.colDef.field, oldValue, newValue);
                } else {
                  const topLevelChild = params.node.allLeafChildren.find((child) => {
                    return child.data.first_name === params.node.aggData.first_name && child.data.last_name === params.node.aggData.last_name;
                  });

                  context.gridOptions.api.forEachNode((node) => {
                    console.log(node);
                  });

                  modifyRowData(context, null, params.colDef.field, newValue, topLevelChild.data.id);
                  await processCellForDatabase(context, null, params.colDef.field, oldValue, newValue, topLevelChild.data.id);
                }
              } catch (err) {
                return errorHandler({err: err, context: 'entry.cellRenderer', isLast: true});
              }
            });

            return input;
          };
        }
      }
    }

    if (column.comparator) {
      switch (column.comparator) {
        case 'numeric':
          entry.comparator = numericComparator;
          break;
        case 'currency':
          entry.comparator = currencyComparator;
          break;
      }
    }

    if (column.cell_style) {
      entry.cellClass = column.cell_style;
    }

    if ((context.params.options.rowGroup && context.params.options.rowGroup.includes(column.column_name)) || column.row_group) {
      entry.rowGroup = true;
      entry.hide = true;
    }

    if (context.params.options.rowGroupFilter && context.params.options.rowGroupFilter.includes(column.column_name)) {
      entry.hide = true;
    }

    if (column.agg_func) {
      entry.aggFunc = column.agg_func;
    }

    return entry;
  };

  try {
    const schema = await getDataTablesSchema(context);
    context.setSchemaTable(schema);

    const columnDefs = [];

    if (!context.params.options.reporting) {
      const cosmeticIdColumn = columns.find((column) => column.column_name === context.COSMETIC_ID);
      columnDefs.push(generateColumnDefEntry(cosmeticIdColumn));
    }

    columns.forEach((column) => {
      if (!column.db_only || /adminaggridspreadsheet/.test(document.URL)) {
        const allowedDataTypes = [
          'character varying',
          'text',
          'date',
          'time without time zone',
          'time with time zone',
          'timestamp without time zone',
          'timestamp with time zone',
          'integer',
          'bigint',
          'double precision',
          'real',
          'boolean'
        ];

        const isAllowedDataType = schema.some((entry) => entry.column_name === column.column_name && (allowedDataTypes.includes(entry.data_type)));
        if (isAllowedDataType) {
          columnDefs.push(generateColumnDefEntry(column));
        }
      }
    });

    return columnDefs;
  } catch (err) {
    return errorHandler({err: err, context: 'generateColumnDefs'});
  }
}