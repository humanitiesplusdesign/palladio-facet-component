// Facet filter module

angular.module('palladioFacetComponent', ['palladio', 'palladio.services'])
	.run(['componentService', function(componentService) {
		var compileStringFunction = function (newScope, options) {

			// Options
			//		showControls: true
			//		showAccordion: true
			//		showSettings: true
			//		showDropArea: true
			//		dimensions: []
			//		aggregation: []
			//		height: 300px
			//    onRemove: function() { ... }

			newScope.showControls = newScope.showControls === undefined ? true : newScope.showControls;
			newScope.showAccordion = newScope.showAccordion === undefined ? true : newScope.showAccordion;
			newScope.showDropArea = newScope.showDropArea === undefined ? true : newScope.showDropArea;
			newScope.showSettings = newScope.showSettings === undefined ? true : newScope.showSettings;
			newScope.dimensions = newScope.dimensions === undefined ? [] : newScope.dimensions;
			newScope.aggregation = newScope.aggregation === undefined ? false : {
				key: newScope.aggregation.key,
				type: newScope.aggregation.countable ? 'count' : 'sum',
				field: newScope.aggregation,
				fileId: newScope.aggregation.originFileId ? newScope.aggregation.originFileId : 0
			};
			newScope.height = newScope.height === undefined ? "300px" : newScope.height;
			newScope.onRemove = newScope.onRemove === undefined ? function() {} : newScope.onRemove;
			newScope.functions = {};

			var compileString = '<div data-palladio-facet-filter ';

			compileString += 'show-controls=showControls ';
			compileString += 'show-accordion=showAccordion ';
			compileString += 'show-drop-area=showDropArea ';
			compileString += 'show-settings=showSettings ';
			compileString += 'height=height ';
			compileString += 'on-remove=onRemove() ';
			compileString += 'functions=functions ';

			if(newScope.dimensions.length > 0) {
				compileString += 'config-dimensions="dimensions" ';
			}

			if(newScope.aggregation) {
				compileString += 'config-aggregation="aggregation" ';
			}

			compileString += '></div>';

			return compileString;
		};

		componentService.register('facet', compileStringFunction);
	}])
	.directive('palladioFacetFilterSettings', [function() {
		return {
			require: '^palladioFacetFilter',
			scope: { },
			templateUrl: 'partials/palladio-facet-component/settings.html',
			link: {
				pre: function(scope, element, attrs, facetCtrl) {
					scope.facetScope = facetCtrl.getScope();
				}
			}
		}
	}])
	.directive('palladioFacetFilter', ['palladioService', 'dataService', '$compile', function (palladioService, dataService, $compile) {
		return {
			scope : {
				height: '=',
				showControls: '=',
				showAccordion: '=',
				showDropArea: '=',
				showSettings: '=',
				configDimensions: '=',
				configAggregation: '=',
				onRemove: '&onRemove',
				functions: '='
			},
			templateUrl : 'partials/palladio-facet-component/template.html',
			controller: ['$scope', function($scope) {
				this.getScope = function () {
					return $scope;
				}
			}],
			link : {
				pre : function(scope, element) {

					var numericHeight;
					var headerHeight = 30;
					var minCellHeight = 20;

					if(!scope.height) {
						scope.calcHeight = "200px";
						numericHeight = 200;
					} else {
						scope.calcHeight = scope.height;
						numericHeight = +scope.calcHeight.substring(0, (scope.calcHeight.length - 2));
					}

					numericHeight = numericHeight - headerHeight;
					scope.dropMarginTop = (numericHeight - 100)/3 + 'px';

					// In the pre-linking function we can use scope.data, scope.metadata, and
					// scope.xfilter to populate any additional scope values required by the
					// template.

					var deregister = [];

					scope.metadata = dataService.getDataSync().metadata;
					scope.xfilter = dataService.getDataSync().xfilter;

					scope.uniqueToggleId = "facetFilter" + Math.floor(Math.random() * 10000);
					scope.uniqueToggleHref = "#" + scope.uniqueToggleId;
					scope.uniqueModalId = scope.uniqueToggleId + "modal";

					scope.dimensions = [];
					scope.config = {};
					scope.title = "Facet Filter";

					scope.remove = function() {
						scope.$destroy();
						angular.element(element).remove();
						scope.onRemove();
					}

					scope.dropModel = false;

					scope.$watch('dropModel', function() {
						if(scope.dropModel) {
							scope.dims = scope.dims.concat(scope.dropModel);
							scope.dropModel = false;
						}
					});

					// Set up aggregation selection.
					scope.getAggDescription = function (field) {
						if(field.type === 'count') {
							return 'Number of ' + field.field.countDescription;
						} else {
							return 'Sum of ' + field.field.description + ' (from ' + countDims.get(field.fileId).countDescription + ' table)';
						}
					};

					var countDims = d3.map();
					scope.metadata.filter(function (d) { return d.countable === true; })
						.forEach(function (d) {
							countDims.set(d.originFileId ? d.originFileId : 0, d);
						});

					scope.aggDims = scope.metadata.filter(function (d) { return d.countable === true || d.type === 'number'; })
						.map(function (a) {
							return {
								key: a.key,
								type: a.countable ? 'count' : 'sum',
								field: a,
								fileId: a.originFileId ? a.originFileId : 0
							};
						})
						.filter(function(d) { return countDims.get(d.fileId) ? true : false; })
						.sort(function (a, b) { return scope.getAggDescription(a) < scope.getAggDescription(b) ? -1 : 1; });


					scope.aggDim = scope.configAggregation ? scope.configAggregation : scope.aggDims[0];
					scope.$watch('aggDim', function () {
						if(scope.aggDim.key) {

							// Rebuild the facets with the new grouping.
							var selection = d3.select(element[0]).select('.inner-facet-container');
							var facets = selection
								.selectAll('.facet')
									.data(scope.dims, function(d) { return calculateDomKey(d.key); });

							facets.each(function (d) {
								buildFacetData(d);
							});

							updateFacets();
						}
					});
					scope.showAggModal = function () { $('#' + scope.uniqueModalId).find('#facet-agg-modal').modal('show'); };

					scope.showModal = function () { $('#' + scope.uniqueModalId).find('#facet-modal').modal('show'); };

					scope.fieldDescriptions = function () {
						return scope.dims.map( function (d) { return d.description; }).join(", ");
					};

					scope.countDescription = function () {
						if(scope.uniqueDimension) {
							return scope.uniqueDimension.countDescription;
						} else {
							return false;
						}
					};

					scope.getCountDescription = function (field) {
						return field.countDescription;
					};

					scope.uniqueDimension = undefined;

					// There can be only one unique key, so no selection for this one.
					if(scope.metadata.filter(function (d) { return d.countBy === true; })[0]) {
						scope.uniqueDimension = scope.metadata.filter(function (d) { return d.countBy === true; })[0];
						scope.config.uniqueDimension = scope.uniqueDimension.key;
					}

					scope.fields = scope.metadata.filter(function () {
						return true;
					}).sort(function (a, b) { return a.description < b.description ? -1 : 1; });

					// Get the countable fields.
					scope.countFields = scope.metadata.sort(function (a, b) { return a.countDescription < b.countDescription ? -1 : 1; });

					// If configuration dimensions are provided, default to those.
					if(scope.configDimensions) {
						scope.dims = scope.configDimensions;
					} else {
						scope.dims = [];
					}

					scope.check = function (d) {
						return scope.dims.map(function (g) { return g.key; }).indexOf(d.key) !== -1;
					};

					scope.$watch('dims', function () {

						scope.dims.forEach(function(d) {
							// If the dim has not already been updated with dimensions/groups,
							// update it.
							if(d.dimension === undefined) {
								buildFacetData(d);
							}
						});

						var selection = d3.select(element[0]).select('.inner-facet-container');

						var facetContainers = selection
							.selectAll('.facet-container')
								.data(scope.dims, function(d) { return calculateDomKey(d.key); });
								
						var newFacetContainers = facetContainers.enter()
							.append('div')
								.style('height', function() { return scope.calcHeight; })
								.attr('class', 'facet-container');
								
						var buttonGroup = newFacetContainers
							.append('div')
								.classed('facet-header', true)
								.style('height', headerHeight)
								.text(function(d) { return d.description + " (" + d.group.size() + ")"; })
							.append("span")
								.attr("class", "mode-buttons")
							.append("div").attr("class", "btn-group");;

						newFacetContainers
							.append('div')
								.classed('facet', true)
								.style('height', function() { return (numericHeight) + "px"; })
								
						var facets = facetContainers.select('.facet');

						var count = scope.dims.length;

						// Extend the width of the inner- and mid-facet-container
						selection
							.style('width', (225 * count) + 'px');
						selection.select('.mid-facet-container')
							.style('width', (225 * count) + 'px');

						var cells = facets.selectAll('.cell')
								.data(function (d) { return d.group.top(Infinity)
											.map(function(g) {
												return buildCellData(g,d);
											}); },
										function (d) { return d.key; });

						// Highlight/filter option
						// buttonGroup.append("a").attr("class", "btn-mini")
						// 		.classed('active', function(d) { return !d.highlight; })
						// 		.on("click", function(d, i) {
						// 			if(!d.highlight) {
						// 				d.highlight = true;

						// 				// Switch icon
						// 				d3.select(this).select('i').classed('fa-square', false);
						// 				d3.select(this).select('i').classed('fa-square-o', true);

						// 				// Remove filter and update
						// 				d.dimension.filterAll();
						// 				palladioService.removeFilter(scope.uniqueToggleId + d.facetKey);
						// 				applyFilterOrHighlight(d);
						// 				palladioService.update();
						// 			} else {
						// 				d.highlight = false;
						// 				// Switch icon
						// 				d3.select(this).select('i').classed('fa-square', true);
						// 				d3.select(this).select('i').classed('fa-square-o', false);

						// 				// Remove highlight and update
						// 				palladioService.removeHighlight();
						// 				applyFilterOrHighlight(d);
						// 				palladioService.update();
						// 			}
						// 			d3.select(this).classed('active', !d.highlight);
						// 		})
						// 		.append("i").attr("class", "fa fa-square");

						// Sort options twiddle the cells.
						buttonGroup.append("a").attr("class", "btn-mini")
							.attr("tooltip","Select")
							.attr("tooltip-append-to-body","true")
								.on("click", function(d) {
									$(this).toggleClass('active');
									// Remove all current filter values.
									d.filters.splice(0, d.filters.length);
									if(d3.select(this).classed("active")) {
										d.group.all().forEach(function (g) {
											d.filters.push(g.key);
										});
										d.dimension.filterFunction(function() { return true; });
										palladioService.setFilter(
											scope.uniqueToggleId + d.key,
											d.description,
											d.filters.join(', '),
											function() {
												d.filters.splice(0, d.filters.length); // Maintain the reference
												d.dimension.filterAll();
												palladioService.removeFilter(scope.uniqueToggleId + d.key);
												palladioService.update();
											}
										);
									} else {
										d.dimension.filterAll();
										palladioService.removeFilter(scope.uniqueToggleId + d.key);
									}
									palladioService.update();
								})
								.append("i").attr("class", "fa fa-check-square-o");

						buttonGroup.append("a").attr("class", "btn-mini")
								.on("click", function(d, i) {
									$(this).toggleClass('active');
									// Note that we have to reselect just the cells in this facet.
									if(d3.select(this).classed("active")) {
										d3.selectAll(cells[i]).sort(function(a,b) {
											return d3.ascending(a.key, b.key);
										});
										// Switch icon
										d3.select(this).select('i').classed('fa-sort-alpha-asc', false);
										d3.select(this).select('i').classed('fa-sort-numeric-desc', true);
									} else {
										d3.selectAll(cells[i]).sort(function(a,b) {
											return d3.descending(a.displayValue, b.displayValue);
										});
										// Switch icon
										d3.select(this).select('i').classed('fa-sort-alpha-asc', true);
										d3.select(this).select('i').classed('fa-sort-numeric-desc', false);
									}
								})
								.append("i").attr("class", "fa fa-sort-alpha-asc");

						if(scope.showSettings) {
							// Only allow closing the facet if settings are displayed ... for now.
							buttonGroup.append("a").attr("class", "btn-mini")
								.on("click", function (d) {
									if(d.highlight) {
										// If highlighting is in place, remove it.
										palladioService.removeHighlight();
									}
									scope.$apply(function(s) {
										s.dims = s.dims.filter(function (g) {
											return g.key !== d.key;
										});
									});
								})
								.append("i").attr("class", "fa fa-times");	
						}

						var newCells = cells.enter()
							.append('div')
								.classed('cell', true)
								.on('click', filterCell );

						newCells.append('div')
								.classed('cell-text', true);

						newCells.append('div')
								.classed('cell-value', true);

						newCells.call(updateCell);

						// Remove facets.
						facetContainers.exit().each(function(d) {
							palladioService.removeFilter(scope.uniqueToggleId + d.key);
							removeFacetData(d);
							palladioService.update();
						});

						facetContainers.exit().remove();
					});


					function buildFacetData(data) {
						if(data.dimension) {
							data.dimension.filterAll();
							data.dimension.remove();
						}
						data.dimension = scope.xfilter.dimension(function (l) { return "" + l[data.key]; });
						var exceptionKey, summationKey;
						exceptionKey = countDims.get(scope.aggDim.fileId).key;
						summationKey = scope.aggDim.key;
						var countReducer = reductio()
								.exception(function (d) { return d[exceptionKey]; })
									.exceptionCount(true);
						countReducer.value("of")
							.filter(function(d, nf) { return nf; })
							.exception(function (d) { return d[exceptionKey]; })
								.exceptionCount(true);
						var sumReducer = reductio()
							.exception(function (d) { return d[exceptionKey]; })
								.exceptionSum(function(d) { return +d[summationKey]; });
						sumReducer.value("of")
							.filter(function(d, nf) { return nf; })
							.exception(function (d) { return d[exceptionKey]; })
								.exceptionSum(function(d) { return +d[summationKey]; });
						data.group = scope.aggDim.type === "count" ?
							countReducer(data.dimension.group()) :
							sumReducer(data.dimension.group());
						if(scope.aggDim.type === "count") {
							data.group.order(function (d) { return d.exceptionCount; });
						} else {
							data.group.order(function (d) { return d.exceptionSum; });
						}
						var topValue = scope.aggDim.type === "count" ?
							data.group.top(1)[0].value.exceptionCount :
							data.group.top(1)[0].value.exceptionSum;
						var total = scope.aggDim.type === "count" ?
							d3.sum(data.group.all(), function (d) { return d.value.exceptionCount; }) :
							d3.sum(data.group.all(), function (d) { return d.value.exceptionSum; });
						var topRange = topValue / total * numericHeight > minCellHeight*2 ? topValue / total * numericHeight : minCellHeight*2;

						topRange = Math.floor(topRange) - 2;

						data.scale = d3.scale.linear()
							.domain([1, topValue])
							.range([minCellHeight, topRange]);

						data.domKey = calculateDomKey(data.key);
						data.filters = [];
						data.highlight = false;
					}

					function removeFacetData(data) {
						if(data.dimension) {
							data.dimension.filterAll();
							data.dimension.remove();
						}
						data.dimension = undefined;
						data.group = undefined;
						data.scale = undefined;
						data.domKey = undefined;
						data.filters = undefined;
					}

					function updateCell(sel) {
						sel.classed('filter-value', function(d) {
								return d.inFilter;
							}).transition()
								// .style('height', function (d) { return d.displayValue > 0 ? d.scale(d.displayValue) + 'px' : '3px'; });
								.style('height', function (d) { return d.displayValue > 0 ? minCellHeight + 'px' : '3px'; });

						sel.select('.cell-text')
							.text(function(d) { return d.displayValue > 0 ? d.key : ''; });

						sel.select('.cell-value')
							.text(function(d) { return d.displayValue > 0 ? d.displayValue + " / " + d.unfilteredValue : ''; });
							
						// Title for facets that will display the full text
						sel.attr('title', function(d) { return d.key; });
					}

					function buildCellData(cellData, facetData) {
						cellData.scale = facetData.scale;
						cellData.facetKey = facetData.key;
						cellData.facetDescription = facetData.description;
						cellData.dimension = facetData.dimension;
						cellData.filters = facetData.filters;
						cellData.highlight = function () { return facetData.highlight; };
						cellData.inFilter = cellData.filters.indexOf(cellData.key) !== -1;
						if(scope.aggDim.type === "count") {
							cellData.displayValue = cellData.value.exceptionCount;
							cellData.unfilteredValue = cellData.value.of.exceptionCount;
						} else {
							cellData.displayValue = cellData.value.exceptionSum;
							cellData.unfilteredValue = cellData.value.of.exceptionSum;
						}
						return cellData;
					}

					function filterCell(d) {
						if(d.filters.indexOf(d.key) !== -1) {
							// It's already in the filter.
							d.filters.splice(d.filters.indexOf(d.key),1);
						} else {
							// It's not in the filter.
							d.filters.push(d.key);
						}

						applyFilterOrHighlight(d);

						palladioService.update();
					}

					function applyFilterOrHighlight(d) {
						if(typeof d.highlight === 'function' ? !d.highlight() : !d.highlight) {
							if(d.filters.length === 1) {
								d.dimension.filterExact(d.filters[0]);
							} else {
								d.dimension.filterFunction(filterFunction.bind(null, d));
							}

							if(d.filters.length > 0) {
								deregister.push(
									palladioService.setFilter(
										scope.uniqueToggleId + d.facetKey,
										d.facetDescription,
										d.filters.join(', '),
										function() {
											d.filters.splice(0, d.filters.length); // Maintain the reference
											d.dimension.filterAll();
											palladioService.removeFilter(scope.uniqueToggleId + d.facetKey);
											palladioService.update();
										}
									)
								);
							} else {
								palladioService.removeFilter(scope.uniqueToggleId + d.facetKey);
							}
						} else {
							deregister.push(palladioService.setHighlight(highlightFunction.bind(null, d.dimension.accessor, d)));
						}
					}

					function filterFunction(d, v) {
						return d.filters.indexOf(v) !== -1 || d.filters.length === 0;
					}

					function highlightFunction(accessor, facet, v) {
						return facet.filters.indexOf(accessor(v)) !== -1 || facet.filters.length === 0;
					}

					function calculateDomKey(key) {
						return key.split("\n").join("").split('?').join("").split('"').join("").split(")").join("").split("(").join("").split(" ").join("").split(".").join("").split("#").join("").split("/").join("").split(",").join("").split("[").join("").split("]").join("").split("{").join("").split("}").join("");
					}

					function updateFacets() {
						var selection = d3.select(element[0]).select('.inner-facet-container');

						var facets = selection
							.selectAll('.facet')
								.data(scope.dims, function(d) { return calculateDomKey(d.key); });

						var cells = facets.selectAll('.cell')
							.data(function (d) { return d.group.top(Infinity)
											.map(function(g) {
												return buildCellData(g,d);
											}); },
										function (d) { return d.key; });

						cells.call(updateCell);
					}

					var updateCallback = palladioService.onUpdate(scope.uniqueToggleId, updateFacets);

					deregister.push(updateCallback);

					// Clean up after ourselves. Remove dimensions that we have created. If we
					// created watches on another scope, destroy those as well.
					scope.$on('$destroy', function () {
						scope.dims.map(function(d) {
							removeFacetData(d);
						});

						deregister.forEach(function (f) { f(); });

						// Get rid of the modal.
						$('#' + scope.uniqueModalId).remove();
					});

					scope.filterReset = function () {
						scope.dims.forEach(function(d) {
							d.filters = [];
							d.dimension.filterAll();
							palladioService.removeFilter(scope.uniqueToggleId + calculateDomKey(d.key));
						});
						palladioService.update();
					};

					scope.functions = {
						getSettings: function() {
							return element.find('.facet-settings')[0];
						}
					}

					// State save/load.

					var importState = function(state) {
						scope.config = state.config;
						scope.$digest();

						// Remove default dims. We have to copy the array to do this in order to trigger
						// our watcher.
						while(scope.dims.length > 0) {
							if(scope.dims.length > 1) {
								scope.dims = scope.dims.slice(0, scope.dims.length - 1);
							} else {
								scope.dims = [];
							}
							scope.$digest();
						}

						// Need to do this one-by-one because of the way we watch for changes.
						// Important to iterate through the state, not the scope, to maintain order.
						state.dimKeys.forEach(function(d) {
							scope.fields.filter(function(f) { return f.key === d; })
								.forEach(function(d) {
									scope.addKey = d.key;
									scope.$digest();
								});
						});

						// Set the aggregation.
						if(state.aggDimKey) scope.aggDim = scope.aggDims.filter(function(f) { return f.key === state.aggDimKey; })[0];

						// Recalculate domKeys (in case we change format)
						state.domKeys = state.dimKeys.map(function(k) { return calculateDomKey(k); });

						scope.$digest();

						// Grab the facets from the DOM. We're going to click on them to filter.
						var facetSelection = d3.select(element[0]).selectAll('.facet')[0];

						// Set up the filters.
						state.filters.forEach(function(f, i) {
							var simpleArrayOfKeys = [];
							if(f && f[0] && typeof f[0] === 'string') {
								// New format.
								simpleArrayOfKeys = f;
							} else if(f) {
								simpleArrayOfKeys = f.map(function(d) { return d.key; });
							}

							if(simpleArrayOfKeys.length) {
								// Filter the cells to the ones in the saved filter.
								var cells = d3.select(facetSelection[i]).selectAll('.cell')
										.filter(function(d) {
											return simpleArrayOfKeys.indexOf(d.key) !== -1;
										}).each(function() {
											this.click();
										});
							}
						});
					};

					var exportState = function() {
						return {
							config: scope.config,
							aggDimKey: scope.aggDim.key,
							dimKeys: scope.dims.map(function(d) { return d.key; }),
							domKeys: scope.dims.map(function(d) { return calculateDomKey(d.key); }),
							filters: scope.dims.map(function(d) { return d.filters; })
						};
					};

					deregister.push(palladioService.registerStateFunctions(scope.uniqueToggleId, 'facet', exportState, importState));
				},

				post : function(scope, element, attrs) {

					$(element[0]).find('.toggle').on("click", function() {
						$(element[0]).find('.settings-panel').toggle(0, function() {
							$(element[0]).find('.view').toggleClass('span12');
							$(element[0]).find('.view').toggleClass('span10');
						});
					});

					// Move the modal out of the fixed area.
					$(element[0]).find('#facet-modal').parent().appendTo('body');
				}
			}
		};
	}]);
