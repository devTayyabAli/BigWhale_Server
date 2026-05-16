const paginate = (total, limit, page) => {
  const paginator = {
    totalItems: total,
    offset: (page - 1) * limit,
    limit: limit,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    nextPage:  parseInt(page) + 1,
    hasPrevPage: page > 1,
    hasNextPage: page < Math.ceil(total / limit),
    prevPage: page > 1 ? page - 1 : null,
  };
  return paginator;
};
module.exports = {
  paginate,
};
