let r = {
  sales: 9823.1,
  bank1: 3700,
  data: {
    sales: 0,
    bank1: 3700
  }
};
let result = Object.assign({}, r.data || {}, r);
console.log(result.sales);
