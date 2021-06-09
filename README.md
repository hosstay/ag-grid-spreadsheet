# agGrid Spreadsheet

A personal extension of ag-grid to give it more excel like functionality like data/style updates to cells, adding rows, columns, formulas, etc.

Caution: There's a good amount of small bugs and a few bits of half-working functionality from when I uncoupled this from another project. Will work on this over time.

## Getting Started

### Prerequisites

Must have installed agGrid into your project (TODO: Get html script version to work so no packages needed)
npm install ag-grid-community
npm install ag-grid-enterprise

### Database

The way this works with the database is unique.
Given no tables, the grid will create data, style, and columns tables.
Given a data table, the grid will create a style and columns tables.

The data and style tables should have an id and grid_specific_id and the style table should have its id as foreign key to the data tables id.
id is obviously for identification of a specific row, and the grid_specific_id is for the ordering of rows in the grid.
The style tables columns will be the same as the data table with 'styleattrib_' prepended to them.

The column table will have it's own unique set of columns and is used to identify the various columnDefs for each column in the data/style tables.

Additionally, if there are over 200 columns in your data the tables will be broken up into data_table and data_table_2, etc. This is to get around postgresql's max row size
This can be turned off with an option passed in when initializing the grid.
The column table will keep track of which columns are associated with which numbered tables.

TODO: Make table management unintrusive in that it doesn't require changing of the original data table and possibly no requirement for additional tables.

### Installing

* Have agGrid installed into project
* Copy the ag-grid-spreadsheet folder to your front end and use it as shown in example usage. 
  (Does rely on Dataloader for now, which is just my method of getting data from the backend. Can rewrite it how you want it.)
* Copy the controllers/models/utility folders into your backend and reorganize to fit your project structure.
* TODO: Make installation more 'componentized' and/or figure out how to make an npm installer.

## Additions

* Postgresql functions I've used to interact with the database using APIs instead of the grid have been included.

## Built With

* [agGrid](https://www.ag-grid.com/) - Grid

## Authors

* **Taylor Hoss** - [hosstay](https://github.com/hosstay)