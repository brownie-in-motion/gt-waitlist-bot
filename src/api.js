const config = require('../config.json');

const info = async (id) => {
  const url = new URL(config.url);
  url.searchParams.set('term_in', config.term);
  url.searchParams.set('crn_in', id);

  const data = await fetch(url);
  const text = await data.text();

  if (text.includes('No detailed class information found')) {
    return undefined;
  }

  // regex <3 html
  const tableRegex = (header) =>
    new RegExp(
      '<th CLASS="ddlabel" scope="row" >' +
        `<SPAN class="fieldlabeltext">${header}</SPAN>` +
        '</th>\n' +
        '(?:<td CLASS="dddefault">(.+?)</td>\n)?'.repeat(10)
    );

  const seats = text.match(tableRegex('Seats'));
  const waitlist = text.match(tableRegex('Waitlist Seats'));
  const title = text.match(
    /<th CLASS="ddlabel" scope="row" >(.+?)<br \/><br \/><\/th>/
  )

  return {
    title: title[1],
    seats: {
      capacity: parseInt(seats[1]),
      actual: parseInt(seats[2]),
      remaining: parseInt(seats[3]),
    },
    waitlist: {
      capacity: parseInt(waitlist[1]),
      actual: parseInt(waitlist[2]),
      remaining: parseInt(waitlist[3]),
    },
  };
};

module.exports = {
  info,
  async exists(id) {
    return (await info(id)) !== undefined;
  },
  async addable(id) {
    const data = await info(id);
    return (
        data.waitlist.remaining > 0 ||
        data.waitlist.actual < data.seats.remaining
    )
  },
};
