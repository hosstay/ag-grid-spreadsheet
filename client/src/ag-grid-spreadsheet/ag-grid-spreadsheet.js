/*
  # ag-grid-spreadsheet

  ## Example Implementation of ag-grid-spreadsheet (uses aurelia framework and dataLoader fetching, but ag-grid-spreadsheet isn't dependent on them):

  ### .js

  import {inject}   from 'aurelia-framework';

  import {AgGridSpreadsheet} from '../../../../../templates/ag-grid-spreadsheet/ag-grid-spreadsheet';
  import {DataLoader}        from '../../../../../utility/data-loader';

  @inject(DataLoader)
  export class ExampleClass {
    constructor(dataLoader) {
      this.dataLoader = dataLoader;
    }

    attached() {

      const params = {
        gridName: 'example_table',
        gridLabelName: 'Example Name',
        options: {
          changeLog: true,
          formulaBar: true,
          sumBar: true,
          altColumnTable: 'example_table_other_columns',
          db: 'ca',
          suppressTableSplit: true,
          filter: {
            clause: `example_column ILIKE '${context.data.example_column}'`
          },
          defaultSort: [
            {
              colId: 'example_column',
              sort: 'asc'
            },
            {
              colId: 'other_example_column',
              sort: 'desc'
            }
          ]
        }
      }

      this.agGridSpreadsheet = new AgGridSpreadsheet(params, this.dataLoader);
      this.agGridSpreadsheet.start();
    }

    deactivate() {
      if (this.agGridSpreadsheet) {
        this.agGridSpreadsheet.destroy();
      }
    }
  }

  ### .html

  <template>
    <require from="../../../../templates/ag-grid-spreadsheet/ag-grid-spreadsheet-element.html"></require>
    <ag-grid-spreadsheet-element></ag-grid-spreadsheet-element>
  </template>

  ## Options available for use in params.options:

  ### changeLog

  type: boolean

  turns on or off logging of ag-grid-spreadsheet changes to ag_grid_spreadsheet_change_log

  ### formulaBar

  type: boolean

  turns on or off the formula bar at the bottom of the grid.

  can be used with sum bar

  ### sumBar

  type: boolean

  turns on or off the sum bar at the bottom of the grid.

  can be used with formula bar

  ### altColumnTable

  type: string

  designates an alternate column table to be used instead of `${gridName}_columns`

  ### db

  type: string

  designates an alternate db to hit, default is mdx

  ### suppressTableSplit

  type: boolean

  stops the ag-grid-spreadsheet tables from being split up every 200 columns.

  ### filter

  type: array of objects (note: change this to just array of strings?)

  ex:

  {
    clause: 'whole sql clause'
  }

  ex2:

  [
    {
      clause: 'whole sql clause'
    },
    {
      clause: 'whole sql clause'
    },
    {
      clause: 'whole sql clause'
    }
  ]

  allows for filtering of rowData

  ### defaultSort

  type: array of objects

  ex:

  {
    colId: 'columnName',
    sort: 'desc'                 //asc or desc
  }

  allows for grid to be initially sorted
*/

// ag-grid
import 'ag-grid-community/dist/styles/ag-grid.css';
import 'ag-grid-enterprise';

import {AgGridSpreadsheetViewState} from './ag-grid-spreadsheet-view-state';

export class AgGridSpreadsheet {
  constructor(params, dataLoader) {
    /* Grid config */
    this.context = new AgGridSpreadsheetViewState(params, dataLoader);
  }

  start() {
    this.activate();
    this.attached();
  }

  activate() {
  }

  attached() {
    this.context.gridSetup(this.context);
  }

  detached() {
    this.destroy();
  }

  destroy() {
    // End Ag-Grid
    if (this.context.grid) this.context.grid.destroy();

    // Remove document level event listeners
    document.removeEventListener('keydown', this.context.keyPressEventListener, true);
    document.removeEventListener('dblclick', this.context.dblClickEventListener, true);

    // Remove optional html elements below grid
    const formulaBar = document.getElementById(this.context.formulaBar);
    if (formulaBar) formulaBar.remove();

    const sumLabel = document.getElementById(this.context.sumLabel);
    if (sumLabel) sumLabel.remove();
  }
}