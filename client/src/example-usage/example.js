import {inject} from 'aurelia-framework';

import {AgGridSpreadsheet} from '../../templates/ag-grid-spreadsheet/ag-grid-spreadsheet';
import {DataLoader} from '../../templates/ag-grid-spreadsheet/utility/data-loader';
// import {excelExportProcessCellFunc} from '../../templates/ag-grid-spreadsheet/utility/utility';
// import {loading} from '../../templates/ag-grid-spreadsheet/utility/utility';

@inject(DataLoader)
export class Example {
  constructor(dataLoader, ...rest) {
    super(...rest);

    this.dataLoader = dataLoader;
  }

  attached() {
    const params = {
      gridName: 'table_name',
      options: {
        useRoles: true,
        formulaBar: true,
        sumBar: true,
        // changeLog: true,
        // excelExport: {
        //   roles: [
        //     {
        //       name: 'ROLE NAME',
        //       actionName: 'Excel Export',
        //       func: async (params) => {
        //         const context = params.context;
        //         params.columnKeys = ['col1', 'col2', 'col3', 'col4', 'col5', 'col6', 'col7', 'col8', 'col9', 'col10'];
        //         params.processCellCallback = (params) => excelExportProcessCellFunc(params);
        //         await loading(context, true, 'Generating export...');
        //         context.gridOptions.api.exportDataAsExcel(params);
        //         await loading(context, false);
        //       }
        //     },
        //     {
        //       name: 'ROLE NAME 2',
        //       additionalPersons: [{firstName: 'firstName', lastName: 'lastName'}],
        //       actionName: 'Excel Export 2',
        //       func: async (params) => {
        //         const context = params.context;
        //         params.processCellCallback = (params) => excelExportProcessCellFunc(params);
        //         await loading(context, true, 'Generating export...');
        //         context.gridOptions.api.exportDataAsExcel(params);
        //         await loading(context, false);
        //       }
        //     }
        //   ]
        // }
      }
    };

    this.agGridSpreadsheet = new AgGridSpreadsheet(params, this.dataLoader);
    this.agGridSpreadsheet.start();
  }

  deactivate() {
    if (this.agGridSpreadsheet) {
      this.agGridSpreadsheet.destroy();
    }
  }
}