# Timecode Input

Timecode input is a custom HTML input element for media timecodes.  
It is mainly developed for the [metaScore](https://metascore.philharmoniedeparis.fr/) project.

The input allows representing timecode values in the more human readable format "hh:mm:ss.ms".

It extends the native input element and supports the following extra attributes:
- `placeholder`: sets the text to use as placeholders; defaults to "--"
- `min`: sets the minimum allowed value in seconds; defaults to 0
- `max`: sets the maximum allowed value in seconds; defaults to null

## Usage

### Install the custom element

```
npm install git+https://github.com/philharmoniedeparis/timecode-input.git
```

### Import it in your project

```js
import "timecode-input";
```

### Add the input to an HTML page

```html
<input is="timecode-input" max="52" />
```


## License

[CeCILL 2.1](http://www.cecill.info/licences/Licence_CeCILL_V2.1-en.html)


